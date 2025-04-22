// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18; // Используем актуальную версию

// Импортируем ReentrancyGuard из OpenZeppelin
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Inheritance Contract
 * @dev Manages inheritance distribution with enhanced security and fault tolerance.
 * Features: Owner-controlled heir management, time-locked distribution, pull-payment pattern.
 */
contract Inheritance is ReentrancyGuard { // Наследуемся от ReentrancyGuard

    // --- Переменные состояния ---

    /**
     * @dev Address of the contract owner (testator). Immutable after deployment.
     */
    address public immutable owner; // Возвращаем immutable

    /**
     * @dev Flag indicating if the owner has been marked as deceased.
     */
    bool public isDeceased;

    /**
     * @dev Timestamp after which asset distribution (withdrawal) becomes possible.
     */
    uint256 public distributionUnlockTimestamp;

    /**
     * @dev Delay period after marking as deceased before distribution unlocks.
     */
    uint256 public constant DISTRIBUTION_DELAY = 30 days; // Time lock period (e.g., 30 days)

    /**
     * @dev Structure to hold information about each heir.
     */
    struct Heir {
        // address heirAddress; // Address is the key in the mapping, no need to store it again
        uint256 share;      // Share percentage (1-100)
        bool isValid;       // Indicates if the heir entry is valid (used for existence check)
    }

    /**
     * @dev Mapping from heir address to their Heir struct.
     */
    mapping(address => Heir) public heirs;

    /**
     * @dev Array storing all valid heir addresses for easier iteration (read-only use recommended off-chain).
     * Note: Managing this array on removal requires careful implementation to avoid gaps or reordering issues.
     */
    address[] public heirAddresses;

    /**
     * @dev Mapping storing the amount of Ether each heir is entitled to withdraw.
     * Populated by prepareDistribution, decreased by withdrawShare.
     */
    mapping(address => uint256) public pendingWithdrawals;


    // --- События ---
    event HeirAdded(address indexed heir, uint256 share);
    event HeirRemoved(address indexed heir);
    event OwnerDeceased(uint256 distributionUnlockTime);
    event DepositMade(address indexed depositor, uint256 amount);
    event WithdrawalMade(address indexed heir, uint256 amount);


    // --- Ошибки (Custom Errors) ---
    error NotOwner();                       // Caller is not the owner
    error AlreadyDeceased();                // Action cannot be performed after owner is marked deceased
    error NotDeceased();                    // Action requires owner to be marked deceased
    error DistributionTimelockNotPassed();  // The distribution delay period has not passed
    error InvalidAddress();                 // Provided address is the zero address
    error InvalidShare();                   // Provided share percentage is invalid (0 or > 100)
    error HeirAlreadyExists();              // Attempting to add an heir that already exists
    error HeirNotFound();                   // Attempting to access info for a non-existent heir
    error NoHeirs();                        // Action requires at least one heir to be registered
    error SharesNot100Percent(uint256 currentTotal); // Total shares do not sum to 100%
    error NothingToWithdraw();              // Heir has no pending withdrawal amount
    error WithdrawalFailed();               // Ether transfer during withdrawal failed
    error DistributionAlreadyPrepared();    // Attempting to run prepareDistribution again


    // --- Модификаторы ---
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    modifier onlyWhenDeceased() {
        if (!isDeceased) revert NotDeceased();
        _;
    }
    modifier distributionUnlocked() {
        if (!isDeceased) revert NotDeceased();
        if (block.timestamp < distributionUnlockTimestamp) revert DistributionTimelockNotPassed();
        _;
    }

    // --- Функции ---

    /**
     * @dev Contract constructor. Sets the deployer as the owner. Accepts initial deposit.
     * !!! ВОЗВРАЩАЕМ payable и обработку msg.value !!!
     */
    constructor() payable {
        owner = msg.sender;
        if (msg.value > 0) {
            emit DepositMade(msg.sender, msg.value);
        }
    }

    /**
     * @dev Allows the owner to deposit more Ether into the contract.
     */
    function depositInheritance() public payable onlyOwner {
        emit DepositMade(msg.sender, msg.value);
    }

    /**
     * @dev Adds a new heir. Only callable by the owner before being marked as deceased.
     */
    function addHeir(address _heirAddress, uint256 _share) public onlyOwner {
        if (isDeceased) revert AlreadyDeceased();
        if (_heirAddress == address(0)) revert InvalidAddress();
        if (_share == 0 || _share > 100) revert InvalidShare();
        if (heirs[_heirAddress].isValid) revert HeirAlreadyExists();

        uint256 currentTotalShares = 0;
        for (uint i = 0; i < heirAddresses.length; i++) {
            currentTotalShares += heirs[heirAddresses[i]].share;
        }
        if (currentTotalShares + _share > 100) revert SharesNot100Percent(currentTotalShares + _share);

        heirs[_heirAddress] = Heir({
            share: _share,
            isValid: true
        });
        heirAddresses.push(_heirAddress);
        emit HeirAdded(_heirAddress, _share);
    }

    /**
     * @dev Marks the owner as deceased. Checks shares sum. Sets timelock. Only callable by owner.
     */
    function markAsDeceased() public onlyOwner {
        if (isDeceased) revert AlreadyDeceased();

        uint256 totalShares = 0;
        if (heirAddresses.length > 0) {
            for (uint256 i = 0; i < heirAddresses.length; i++) {
                totalShares += heirs[heirAddresses[i]].share;
            }
            if (totalShares != 100) {
                revert SharesNot100Percent(totalShares);
            }
        }

        isDeceased = true;
        distributionUnlockTimestamp = block.timestamp + DISTRIBUTION_DELAY;
        emit OwnerDeceased(distributionUnlockTimestamp);
    }

    /**
     * @dev Prepares withdrawal amounts. Callable by anyone after timelock. Idempotent.
     */
    function prepareDistribution() public distributionUnlocked {
        if (heirAddresses.length == 0) revert NoHeirs();
        if (pendingWithdrawals[heirAddresses[0]] > 0) revert DistributionAlreadyPrepared();

        uint256 balanceToDistribute = address(this).balance;

        for (uint256 i = 0; i < heirAddresses.length; i++) {
            address heirAddress = heirAddresses[i];
            Heir storage heir = heirs[heirAddress];
            if (heir.isValid) {
                uint256 heirAmount = (balanceToDistribute * heir.share) / 100;
                pendingWithdrawals[heirAddress] = heirAmount;
            }
        }
    }

    /**
     * @dev Allows an heir to withdraw their share.
     * !!! ВОЗВРАЩАЕМ nonReentrant !!!
     */
    function withdrawShare() public nonReentrant {
        address payable heir = payable(msg.sender);
        uint256 amount = pendingWithdrawals[heir];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[heir] = 0; // Effects before Interaction

        (bool success, ) = heir.call{value: amount}(""); // Interaction

        if (!success) {
            pendingWithdrawals[heir] = amount; // Revert state if interaction failed
            revert WithdrawalFailed();
        }

        emit WithdrawalMade(heir, amount);
    }

    // --- Функции только для чтения (View) ---
    function getHeirInfo(address _heirAddress) public view returns (uint256 share, bool isValid, uint256 pendingWithdrawal) {
        Heir memory heir = heirs[_heirAddress];
        if (!heir.isValid) revert HeirNotFound();
        return (heir.share, heir.isValid, pendingWithdrawals[_heirAddress]);
    }
    function getAllHeirs() public view returns (address[] memory addresses, uint256[] memory shares, uint256[] memory pending) {
         uint length = heirAddresses.length;
        addresses = new address[](length);
        shares = new uint256[](length);
        pending = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            address currentHeirAddr = heirAddresses[i];
            if(heirs[currentHeirAddr].isValid) {
                 addresses[i] = currentHeirAddr;
                 shares[i] = heirs[currentHeirAddr].share;
                 pending[i] = pendingWithdrawals[currentHeirAddr];
            }
        }
        return (addresses, shares, pending);
    }
    function getOwnerStatus() public view returns (address ownerAddress, bool deceased) { return (owner, isDeceased); }
    function checkContractBalance() public view returns (uint256) { return address(this).balance; }

    /**
     * @dev Fallback function to accept direct Ether transfers (will emit DepositMade).
     */
    receive() external payable {
        emit DepositMade(msg.sender, msg.value);
    }
}
