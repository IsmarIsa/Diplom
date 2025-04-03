// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Inheritance {
    address public owner;
    bool public isDeceased;
    uint256 public totalInheritance;

    struct Heir {
        address heirAddress;
        uint256 share; 
        bool isValid;
        uint256 inheritedAmount;
    }

    mapping(address => Heir) public heirs;
    address[] public heirAddresses;

    event HeirAdded(address heir, uint256 share);
    event HeirRemoved(address heir);
    event OwnerDeceased();
    event AssetsDistributed(address heir, uint256 amount);

    constructor() payable {
        owner = msg.sender; 
        isDeceased = false;
        totalInheritance = msg.value;
    }

    function depositInheritance() public payable {
        require(msg.sender == owner, "Only owner can deposit");
        totalInheritance += msg.value;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier onlyWhenDeceased() {
        require(isDeceased, "Owner is not deceased");
        _;
    }

    function addHeir(address _heirAddress, uint256 _share) public onlyOwner {
        require(_heirAddress != address(0), "Invalid heir address");
        require(_share > 0 && _share <= 100, "Invalid share percentage");
        require(!heirs[_heirAddress].isValid, "Heir already exists");

        heirs[_heirAddress] = Heir({
            heirAddress: _heirAddress,
            share: _share,
            isValid: true,
            inheritedAmount: 0
        });
        heirAddresses.push(_heirAddress);

        emit HeirAdded(_heirAddress, _share);
    }

    function markAsDeceased() public onlyOwner {
        isDeceased = true;
        emit OwnerDeceased();
    }

    function distributeAssets() public onlyWhenDeceased {
        require(heirAddresses.length > 0, "No heirs defined");

        uint256 totalShares = 0;
        
        for (uint256 i = 0; i < heirAddresses.length; i++) {
            totalShares += heirs[heirAddresses[i]].share;
        }
        require(totalShares == 100, "Total shares must equal 100%");

        require(address(this).balance > 0, "No assets to distribute");

        for (uint256 i = 0; i < heirAddresses.length; i++) {
            address heirAddress = heirAddresses[i];
            Heir storage heir = heirs[heirAddress];
            
            uint256 heirAmount = (address(this).balance * heir.share) / 100;
            
            (bool success, ) = payable(heirAddress).call{value: heirAmount}("");
            require(success, "Transfer failed");
            
            heir.inheritedAmount = heirAmount;
            
            emit AssetsDistributed(heirAddress, heirAmount);
        }

        totalInheritance = 0;
    }

    function getHeirInfo(address _heirAddress) public view returns (
        uint256 share, 
        bool isValid, 
        uint256 inheritedAmount
    ) {
        Heir memory heir = heirs[_heirAddress];
        return (heir.share, heir.isValid, heir.inheritedAmount);
    }

    function getAllHeirs() public view returns (
        address[] memory addresses, 
        uint256[] memory shares
    ) {
        addresses = new address[](heirAddresses.length);
        shares = new uint256[](heirAddresses.length);

        for (uint256 i = 0; i < heirAddresses.length; i++) {
            addresses[i] = heirAddresses[i];
            shares[i] = heirs[heirAddresses[i]].share;
        }

        return (addresses, shares);
    }

    function getOwnerStatus() public view returns (
        address ownerAddress, 
        bool deceased
    ) {
        return (owner, isDeceased);
    }

    function checkContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}