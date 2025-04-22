document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const connectWalletBtn = document.getElementById('connectWallet');
    const disconnectWalletBtn = document.getElementById('disconnectWalletBtn');
    const userAccountSpan = document.getElementById('userAccount');
    const statusMessageSpan = document.getElementById('status-message');
    const ownerAddressSpan = document.getElementById('ownerAddress');
    const ownerDeceasedStatusSpan = document.getElementById('ownerDeceasedStatus');
    const contractBalanceSpan = document.getElementById('contractBalance');
    const checkBalanceBtn = document.getElementById('checkBalanceBtn');
    const notificationsDiv = document.getElementById('notifications');
    // New/Updated Elements
    const distributionUnlockTimeSpan = document.getElementById('distributionUnlockTime');
    const unlockTimeRow = document.getElementById('unlockTimeRow');
    const preparationSection = document.getElementById('preparationSection');
    const prepareDistributionBtn = document.getElementById('prepareDistributionBtn');
    const heirWithdrawSection = document.getElementById('heirWithdrawSection');
    const withdrawableAmountSpan = document.getElementById('withdrawableAmount');
    const withdrawShareBtn = document.getElementById('withdrawShareBtn');
    // Owner Actions Elements
    const ownerActionsSection = document.getElementById('ownerActions');
    const addHeirBtn = document.getElementById('addHeirBtn');
    const heirAddressInput = document.getElementById('heirAddressInput');
    const shareInput = document.getElementById('shareInput');
    const depositBtn = document.getElementById('depositBtn');
    const depositAmountInput = document.getElementById('depositAmountInput');
    const markDeceasedBtn = document.getElementById('markDeceasedBtn');
    // Heirs List
    const heirsListDiv = document.getElementById('heirsList');

    // --- Global Variables ---
    let web3;
    let contract;
    let userAccount;
    let contractInfo;
    let contractOwner; // Store owner address globally
    let isOwnerDeceased; // Store status globally
    let distributionUnlockTimestamp; // Store unlock time globally
    let userPendingWithdrawal = 0; // Store user's specific withdrawal amount

    // Store original button HTML content (including icons)
    const originalButtonContent = {
        connectWallet: connectWalletBtn?.innerHTML || '<i class="fas fa-wallet"></i> Подключить кошелек',
        disconnectWallet: disconnectWalletBtn?.innerHTML || '<i class="fas fa-sign-out-alt"></i> Отключить',
        checkBalance: checkBalanceBtn?.innerHTML || '<i class="fas fa-sync"></i> Обновить баланс',
        addHeir: addHeirBtn?.innerHTML || '<i class="fas fa-user-plus"></i> Добавить',
        deposit: depositBtn?.innerHTML || '<i class="fas fa-coins"></i> Пополнить',
        markDeceased: markDeceasedBtn?.innerHTML || '<i class="fas fa-user-slash"></i> Отметить как умершего',
        prepareDistribution: prepareDistributionBtn?.innerHTML || '<i class="fas fa-calculator"></i> Подготовить распределение',
        withdrawShare: withdrawShareBtn?.innerHTML || '<i class="fas fa-download"></i> Забрать свою долю',
    };

    // --- Initialization ---
    async function initApp() {
        // Attach initial listeners that are always present
        connectWalletBtn?.addEventListener('click', connectWallet);
        disconnectWalletBtn?.addEventListener('click', disconnectWallet);
        checkBalanceBtn?.addEventListener('click', updateContractBalance);
        // Listeners for prepare/withdraw/owner actions will be added/removed dynamically

        try { // Load contract info
            const response = await fetch('contract-info.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            contractInfo = await response.json();
            if (!contractInfo.address || !contractInfo.abi) throw new Error("Invalid contract-info.json structure.");
            console.log("Contract Info Loaded:", contractInfo.address);
        } catch (error) {
             console.error("Failed to load contract-info.json:", error);
             showNotification("Ошибка: Не удалось загрузить информацию о контракте.", "error");
             if(statusMessageSpan) statusMessageSpan.textContent = "Ошибка загрузки";
             return; // Stop initialization
        }

        if (typeof window.ethereum !== 'undefined') { // Setup Web3 & check connection
            web3 = new Web3(window.ethereum);
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', () => window.location.reload());
            try {
                 const accounts = await web3.eth.getAccounts();
                 console.log("Initial accounts found:", accounts.length);
                 if (accounts.length > 0) {
                     await connectWallet(true); // Try auto-connect if accounts exist
                 } else {
                     if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек не подключен";
                     resetUI(); // Ensure UI is in disconnected state
                 }
            } catch (err) {
                 console.error("Error getting initial accounts:", err);
                 if(statusMessageSpan) statusMessageSpan.textContent = "Ошибка подключения";
                 resetUI();
            }
        } else {
             if(statusMessageSpan) statusMessageSpan.textContent = "MetaMask не найден";
             showNotification("Пожалуйста, установите MetaMask.", "warning");
            resetUI();
        }
    }

    // --- Wallet Connection & Disconnection ---
    async function connectWallet(isAutoConnect = false) {
        console.log("Attempting to connect wallet...");
        if (typeof window.ethereum === 'undefined') {
            return showNotification('Пожалуйста, установите MetaMask!', 'warning');
        }
        try {
            if(statusMessageSpan) statusMessageSpan.textContent = "Подключение...";
            // Request accounts / connect wallet
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log("Accounts requested:", accounts);

            // Setup account and contract instance (handleAccountsChanged might be called by event too)
            await setupContractAndAccount(accounts);

            if (!contract) throw new Error("Не удалось инициализировать контракт.");

            if (!isAutoConnect) {
                showNotification('Кошелек успешно подключен!', 'success');
            }
            if(statusMessageSpan) statusMessageSpan.textContent = "Подключен";
            console.log("Wallet connected, refreshing data...");
            await refreshAllData(); // Fetch data and update UI

        } catch (error) {
            console.error('Ошибка подключения кошелька:', error);
            if (error.code !== 4001) { // Ignore user rejection error code
                 showNotification(`Ошибка подключения: ${error.message || error}`, 'error');
            }
            if(statusMessageSpan) statusMessageSpan.textContent = "Ошибка подключения";
            resetUI();
        }
    }

    function disconnectWallet() {
        console.log("Disconnecting wallet...");
        // Clear global state
        userAccount = null;
        contract = null;
        contractOwner = null;
        isOwnerDeceased = null;
        distributionUnlockTimestamp = null;
        userPendingWithdrawal = 0;

        resetUI(); // Reset UI to initial disconnected state

        showNotification("Кошелек отключен.", "info");
        if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек отключен";

        // Explicitly manage header button visibility after reset
        if(connectWalletBtn) connectWalletBtn.style.display = 'inline-flex';
        if(userAccountSpan) userAccountSpan.style.display = 'none';
        if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'none';
    }

    async function setupContractAndAccount(accounts) {
         if (accounts && accounts.length > 0) { // Check if accounts array is valid
            const newAccount = accounts[0];
            // Only update if account is actually new or wasn't set before
            if (newAccount !== userAccount) {
                 userAccount = newAccount;
                 console.log('Аккаунт установлен:', userAccount);
            }

             if(userAccountSpan) {
                 userAccountSpan.textContent = `${userAccount.substring(0, 6)}...${userAccount.substring(userAccount.length - 4)}`;
                 userAccountSpan.style.display = 'inline-block'; // Show address
             }
             if(connectWalletBtn) connectWalletBtn.style.display = 'none'; // Hide connect button
             if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'inline-flex'; // Show disconnect button

             // Initialize contract instance if necessary
             if (web3 && contractInfo && (!contract || contract.options.address.toLowerCase() !== contractInfo.address.toLowerCase())) {
                 try {
                    contract = new web3.eth.Contract(contractInfo.abi, contractInfo.address);
                    console.log("Contract instance created/updated:", contract.options.address);
                 } catch (contractError) {
                     console.error("Error creating contract instance:", contractError);
                     showNotification("Ошибка инициализации контракта.", "error");
                     contract = null; // Ensure null on error
                 }
             }
         } else {
             // No accounts connected or available
            userAccount = null;
            contract = null;
            console.log("No accounts connected/available.");
             if(userAccountSpan) userAccountSpan.style.display = 'none'; // Hide address
             if(connectWalletBtn) connectWalletBtn.style.display = 'inline-flex'; // Show connect button
             if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'none'; // Hide disconnect button
         }
    }

     async function handleAccountsChanged(accounts) {
         console.log("MetaMask accounts changed event:", accounts);
         const hadAccountBefore = !!userAccount; // Was there an account before this event?
         await setupContractAndAccount(accounts); // Updates userAccount, contract, and header buttons

         if (userAccount) {
             console.log("Account present/changed, refreshing data.");
             await refreshAllData(); // Refresh all data for the new/current account
         } else if (hadAccountBefore) {
             // Account was lost (user disconnected from site in MetaMask)
             console.log("Account lost, resetting UI.");
             resetUI();
             if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек отключен";
             showNotification("Кошелек был отключен.", "info");
         } else {
             // No account before, no account now (shouldn't happen often here, but reset just in case)
             console.log("No account before or after change, ensuring UI is reset.");
             resetUI();
             if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек не подключен";
         }
     }

    // --- Contract Interaction Functions ---

    async function updateContractData() {
        if (!contract) return;
        console.log("Updating contract data (Status, Balance, Unlock Time)...");
        try {
            // Fetch status and unlock time in parallel
            const [status, fetchedUnlockTimestamp, balanceWei] = await Promise.all([
                contract.methods.getOwnerStatus().call(),
                contract.methods.distributionUnlockTimestamp().call(),
                web3.eth.getBalance(contractInfo.address)
            ]);

            // Update global state
            contractOwner = status[0];
            isOwnerDeceased = status[1];
            distributionUnlockTimestamp = Number(fetchedUnlockTimestamp); // Convert BigInt/string to number

            // Update UI
            if(ownerAddressSpan) ownerAddressSpan.textContent = contractOwner;
            if(ownerDeceasedStatusSpan) ownerDeceasedStatusSpan.textContent = isOwnerDeceased ? 'Умер' : 'Жив';

            // Display unlock time if deceased
            if (isOwnerDeceased && distributionUnlockTimestamp > 0) {
                 if(distributionUnlockTimeSpan) distributionUnlockTimeSpan.textContent = formatTimestamp(distributionUnlockTimestamp);
                 if(unlockTimeRow) unlockTimeRow.style.display = 'block';
            } else {
                 if(unlockTimeRow) unlockTimeRow.style.display = 'none';
            }

            // Update balance
            const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
            if(contractBalanceSpan) contractBalanceSpan.textContent = parseFloat(balanceEth).toFixed(4);
            console.log("Owner:", contractOwner, "Deceased:", isOwnerDeceased, "Unlock TS:", distributionUnlockTimestamp);

        } catch (error) {
            console.error('Ошибка обновления данных контракта:', error);
            showNotification('Не удалось обновить данные контракта.', 'error');
             // Reset potentially incorrect UI elements
             if(ownerAddressSpan) ownerAddressSpan.textContent = 'Ошибка';
             if(ownerDeceasedStatusSpan) ownerDeceasedStatusSpan.textContent = 'Ошибка';
             if(contractBalanceSpan) contractBalanceSpan.textContent = 'Ошибка';
             if(unlockTimeRow) unlockTimeRow.style.display = 'none';
        }
    }

    async function updateContractBalance() {
        if (!contract || !checkBalanceBtn) return;
         const originalHtml = checkBalanceBtn.innerHTML;
         checkBalanceBtn.disabled = true;
         checkBalanceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обновление...';
         await updateContractData(); // Refetch all data including balance
         // Ensure button is re-enabled even if updateContractData had an error
         checkBalanceBtn.disabled = false;
         checkBalanceBtn.innerHTML = originalHtml; // Use original HTML content
    }

    async function displayHeirs() {
        if (!contract || !heirsListDiv) return;
        console.log("Fetching heirs list...");
        try {
            // Call the updated contract function
            const heirsData = await contract.methods.getAllHeirs().call();
            const addresses = heirsData[0];
            const shares = heirsData[1];
            const pendingWithdrawals = heirsData[2]; // Get pending amounts

            if (!addresses || addresses.length === 0) {
                heirsListDiv.innerHTML = '<p>Наследники еще не добавлены.</p>';
                return;
            }

            let listHtml = '<ul>';
            addresses.forEach((address, index) => {
                // Basic validation in case array lengths mismatch somehow
                if (index < shares.length && index < pendingWithdrawals.length) {
                    const share = shares[index];
                    const pendingWei = pendingWithdrawals[index];
                    // Ensure pendingWei is treated as a string for BigInt compatibility with web3.utils
                    const pendingEth = web3.utils.fromWei(pendingWei.toString(), 'ether');

                    listHtml += `
                        <li>
                            <div class="heir-info">
                               <span class="heir-address">${address}</span>
                               <span class="heir-share">Доля: ${share}%</span>
                            </div>
                            <div class="heir-withdrawal-info">`; // Div for withdrawal info

                    // Show pending amount if > 0, otherwise show N/A or similar
                    if (parseFloat(pendingEth) > 0) {
                        listHtml += `Доступно: <span class="withdrawal-amount">${parseFloat(pendingEth).toFixed(4)} ETH</span>`;
                    } else if (isOwnerDeceased) { // Only show 'N/A' if owner is deceased but amount is 0
                        listHtml += `<span class="no-withdrawal">Недоступно</span>`;
                    } // Else: Don't show anything before owner is deceased and preparation

                    listHtml += `</div></li>`;
                }
            });
            listHtml += '</ul>';
            heirsListDiv.innerHTML = listHtml;
            console.log("Heirs list displayed with pending withdrawals.");

        } catch (error) {
            console.error('Ошибка получения списка наследников:', error);
            showNotification('Не удалось загрузить список наследников.', 'error');
            if(heirsListDiv) heirsListDiv.innerHTML = '<p>Ошибка загрузки списка наследников.</p>';
        }
    }

    // --- NEW: Prepare Distribution ---
    async function prepareDistribution() {
        if (!contract || !userAccount || !prepareDistributionBtn) return showNotification('Ошибка: Контракт не инициализирован.', 'error');
        if (!isOwnerDeceased) return showNotification('Владелец еще не отмечен как умерший.', 'warning');

        // Re-check timelock just before sending transaction using block time
        let blockTimestamp = Math.floor(Date.now() / 1000); // Fallback
        try { blockTimestamp = Number((await web3.eth.getBlock('latest')).timestamp); }
        catch { console.warn("Could not get block timestamp for prepare check, using browser time."); }

        if (blockTimestamp < distributionUnlockTimestamp) return showNotification('Срок блокировки для подготовки распределения еще не прошел.', 'warning');

        showProcessing(prepareDistributionBtn, true, 'Подготовка...');
        try {
            await contract.methods.prepareDistribution().send({ from: userAccount });
            showNotification('Распределение успешно подготовлено! Наследники могут забирать свои доли.', 'success');
            await refreshAllData(); // Refresh everything including UI state
        } catch (error) {
            handleTransactionError(error, "Ошибка подготовки");
        } finally {
            showProcessing(prepareDistributionBtn, false);
        }
    }

    // --- NEW: Withdraw Share ---
    async function withdrawShare() {
         if (!contract || !userAccount || !withdrawShareBtn) return showNotification('Ошибка: Контракт не инициализирован.', 'error');
         // Re-fetch user's pending amount right before withdrawal attempt for accuracy
         await updateUserWithdrawalStatus(); // Make sure userPendingWithdrawal is up-to-date
         if (userPendingWithdrawal <= 0) return showNotification('Нет доступных средств для вывода.', 'warning');

         showProcessing(withdrawShareBtn, true, 'Вывод...');
         try {
            await contract.methods.withdrawShare().send({ from: userAccount });
            showNotification('Ваша доля успешно выведена!', 'success');
            await refreshAllData(); // Refresh everything
         } catch (error) {
             handleTransactionError(error, "Ошибка вывода");
         } finally {
             showProcessing(withdrawShareBtn, false);
         }
    }

     // --- NEW: Helper to check current user's withdrawal status ---
    async function updateUserWithdrawalStatus() {
         if (!contract || !userAccount) {
             userPendingWithdrawal = 0;
             if (withdrawableAmountSpan) withdrawableAmountSpan.textContent = 'N/A'; // Clear display if no user/contract
             return;
         }
         try {
            // Fetch pending amount specifically for the current user
            const pendingWei = await contract.methods.pendingWithdrawals(userAccount).call();
            // Convert result to string before parsing to handle potential BigInts
            userPendingWithdrawal = parseFloat(web3.utils.fromWei(pendingWei.toString(), 'ether'));
            console.log(`User ${userAccount} pending withdrawal: ${userPendingWithdrawal} ETH`);
            if (withdrawableAmountSpan) {
                withdrawableAmountSpan.textContent = userPendingWithdrawal > 0 ? userPendingWithdrawal.toFixed(4) : '0.0000';
            }
         } catch (error) {
             console.error("Error fetching user pending withdrawal:", error);
             userPendingWithdrawal = 0; // Assume 0 on error
             if (withdrawableAmountSpan) withdrawableAmountSpan.textContent = 'Ошибка';
         }
    }


    // --- Owner Actions (addHeir, depositFunds, markAsDeceased) ---
    async function addHeir() {
         if (!contract || !userAccount) return showNotification('Подключите кошелек.', 'warning');
         if (!isUserOwner()) return showNotification('Только владелец может добавлять.', 'warning');
         if (!addHeirBtn || !heirAddressInput || !shareInput) return; // Defensive check

         const heirAddress = heirAddressInput.value.trim();
         const share = shareInput.value.trim();

         if (!web3.utils.isAddress(heirAddress)) return showNotification('Введите корректный адрес наследника.', 'error');
         const shareInt = parseInt(share);
         if (!share || isNaN(shareInt) || shareInt <= 0 || shareInt > 100) return showNotification('Введите корректную долю наследства (1-100).', 'error');

         showProcessing(addHeirBtn, true, 'Добавление...');
         try {
            await contract.methods.addHeir(heirAddress, shareInt).send({ from: userAccount });
            showNotification('Наследник успешно добавлен!', 'success');
            heirAddressInput.value = ''; shareInput.value = '';
            await displayHeirs(); // Refresh list only
         } catch (error) { handleTransactionError(error, "Ошибка добавления"); }
         finally { showProcessing(addHeirBtn, false); }
    }

    async function depositFunds() {
         if (!contract || !userAccount) return showNotification('Подключите кошелек.', 'warning');
         if (!isUserOwner()) return showNotification('Только владелец может пополнять.', 'warning');
         if (!depositBtn || !depositAmountInput) return;

         const amountEth = depositAmountInput.value.trim();
         if (!amountEth || parseFloat(amountEth) <= 0) return showNotification('Введите корректную сумму для пополнения.', 'error');
         const amountWei = web3.utils.toWei(amountEth, 'ether');

         showProcessing(depositBtn, true, 'Пополнение...');
         try {
             await contract.methods.depositInheritance().send({ from: userAccount, value: amountWei });
             showNotification('Баланс контракта успешно пополнен!', 'success');
             depositAmountInput.value = '';
             await updateContractData(); // Refresh contract info including balance
             // updateUIBasedOnState() will be called by refreshAllData if needed by other actions
         } catch (error) { handleTransactionError(error, "Ошибка пополнения"); }
         finally { showProcessing(depositBtn, false); }
    }

    async function markAsDeceased() {
        if (!contract || !userAccount) return showNotification('Подключите кошелек.', 'warning');
        if (!isUserOwner()) return showNotification('Только владелец может выполнить это действие.', 'warning');
        if (isOwnerDeceased) return showNotification('Владелец уже отмечен как умерший.', 'info');
        if (!markDeceasedBtn) return;

        showProcessing(markDeceasedBtn, true, 'Отметка...');
        try {
            await contract.methods.markAsDeceased().send({ from: userAccount });
            showNotification('Статус владельца успешно изменен на "умер".', 'success');
            await refreshAllData(); // Refresh everything as state changed significantly
        } catch (error) {
             handleTransactionError(error, "Ошибка отметки");
        } finally {
             // Restore button state handled by refreshAllData -> updateUIBasedOnState
             showProcessing(markDeceasedBtn, false);
        }
    }

    // --- UI Update Functions ---

    function showNotification(message, type = 'info', autoClose = true) {
        if (!notificationsDiv) return;
        const closeButtonHtml = `<button onclick="this.parentElement.style.display='none'" style="background:none; border:none; color:inherit; font-size:1.2em; cursor:pointer; padding-left:10px; line-height:1;">×</button>`;
        notificationsDiv.innerHTML = message + closeButtonHtml;
        notificationsDiv.className = `notifications ${type}`;
        notificationsDiv.style.display = 'flex';
        if (notificationsDiv.timer) clearTimeout(notificationsDiv.timer);
        if (autoClose) {
            const delay = (type === 'error' || type === 'warning') ? 8000 : 5000;
            notificationsDiv.timer = setTimeout(() => { notificationsDiv.style.display = 'none'; notificationsDiv.timer = null; }, delay);
        }
    }

    // !!! ИСПОЛЬЗУЕТ ВРЕМЯ БЛОКА ДЛЯ ПРОВЕРКИ TIMELOCK !!!
    async function updateUIBasedOnState() { // Made async
        if (!userAccount || !contract) { await resetUI(); return; } // Use await for resetUI if it becomes async

        // Fetch latest block timestamp *before* making UI decisions based on time
        let currentBlockTimestamp = Math.floor(Date.now() / 1000); // Fallback to browser time
        try {
            // Ensure web3 is initialized before using it
            if (web3) {
                 const block = await web3.eth.getBlock('latest');
                 if (block && block.timestamp) {
                    // Ganache timestamp might be string, convert to number
                    currentBlockTimestamp = Number(block.timestamp);
                 } else {
                     console.warn("Could not get valid block timestamp, using browser time.");
                 }
            } else {
                 console.warn("Web3 not initialized, using browser time for timelock check.");
            }
        } catch (err) {
            console.error("Error fetching latest block timestamp:", err);
            // Use fallback on error
        }

        const isConnected = true;
        const isOwner = isUserOwner();
        // Ensure distributionUnlockTimestamp is a number for comparison
        const isTimelockPassed = isOwnerDeceased && distributionUnlockTimestamp > 0 && currentBlockTimestamp >= distributionUnlockTimestamp;
        // Show prepare button if connected, deceased, timelock passed
        const canPrepare = isConnected && isOwnerDeceased && isTimelockPassed;
        // Show withdraw button if connected, deceased, and user has pending funds
        const canWithdraw = isConnected && isOwnerDeceased && userPendingWithdrawal > 0;

        // Log state for debugging
        console.log("UI Update Check:", {
            isConnected, isOwner, isOwnerDeceased, distributionUnlockTimestamp,
            isTimelockPassed, canPrepare, canWithdraw, userPendingWithdrawal,
            nowBlock: new Date(currentBlockTimestamp * 1000).toLocaleString('ru-RU'),
            unlockTime: formatTimestamp(distributionUnlockTimestamp)
        });

        // Update UI visibility and states
        manageSectionVisibility(ownerActionsSection, isConnected && isOwner && !isOwnerDeceased);
        manageSectionVisibility(preparationSection, canPrepare);
        // Note: manageEventListeners will handle enabling/disabling the prepare button based on canPrepare and userPendingWithdrawal
        manageSectionVisibility(heirWithdrawSection, canWithdraw);
        if(checkBalanceBtn) checkBalanceBtn.disabled = !isConnected;

        // Update event listeners based on current state
        updateEventListeners(canPrepare, canWithdraw); // Pass calculated states
    }

    function manageSectionVisibility(sectionElement, shouldShow) {
         if (sectionElement) {
             sectionElement.style.display = shouldShow ? 'block' : 'none';
         }
     }

    // Centralized listener management
    function updateEventListeners(canPrepare, canWithdraw) { // Accept calculated states
        manageEventListeners(isUserOwner() && !isOwnerDeceased, ownerActionsSection, [
             { element: addHeirBtn, type: 'click', listener: addHeir },
             { element: depositBtn, type: 'click', listener: depositFunds },
             { element: markDeceasedBtn, type: 'click', listener: markAsDeceased }
         ]);
        // Use canPrepare to decide if listeners should be attached/buttons enabled
        manageEventListeners(canPrepare, preparationSection, [
             { element: prepareDistributionBtn, type: 'click', listener: prepareDistribution }
         ]);
        // Use canWithdraw to decide if listeners should be attached/buttons enabled
        manageEventListeners(canWithdraw, heirWithdrawSection, [
             { element: withdrawShareBtn, type: 'click', listener: withdrawShare }
         ]);
    }

     // Helper to add/remove listeners and manage flags/disabled state
     function manageEventListeners(shouldAttach, sectionElement, listeners) {
         if (!sectionElement) return;
         const listenerFlag = 'listenersAttached';
         try {
             if (shouldAttach && !sectionElement.dataset[listenerFlag]) {
                 listeners.forEach(item => item.element?.addEventListener(item.type, item.listener));
                 sectionElement.dataset[listenerFlag] = 'true';
                 // console.log(`Listeners attached for: ${sectionElement.id || 'section'}`);
             } else if (!shouldAttach && sectionElement.dataset[listenerFlag]) {
                 listeners.forEach(item => item.element?.removeEventListener(item.type, item.listener));
                 delete sectionElement.dataset[listenerFlag];
                 // console.log(`Listeners removed for: ${sectionElement.id || 'section'}`);
             }

             // Set disabled state based ONLY on shouldAttach first
             listeners.forEach(item => {
                  if(item.element) item.element.disabled = !shouldAttach;
             });

             // Special logic for prepareDistributionBtn AFTER initial enable/disable
             if (sectionElement.id === 'preparationSection' && prepareDistributionBtn) {
                 // Keep it disabled if !shouldAttach OR if user has pending withdrawal (prep likely done)
                 prepareDistributionBtn.disabled = !shouldAttach || (userPendingWithdrawal > 0);
                 if (userPendingWithdrawal > 0 && shouldAttach) {
                     console.log("Prepare button explicitly disabled because user has pending withdrawal.");
                 }
             }

         } catch (e) {
            console.error("Error managing event listeners:", e, "Section:", sectionElement.id);
         }
     }

    // Reset UI to initial disconnected state
    async function resetUI() { // Made async just in case future reset operations need it
        console.log("Resetting UI...");
        // Header state
        if(userAccountSpan) userAccountSpan.style.display = 'none';
        if(connectWalletBtn) { connectWalletBtn.innerHTML = originalButtonContent.connectWallet; connectWalletBtn.style.display = 'inline-flex'; connectWalletBtn.disabled = false;}
        if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'none';
        // Contract Info section
        if(statusMessageSpan) statusMessageSpan.textContent = "Не подключен";
        if(ownerAddressSpan) ownerAddressSpan.textContent = 'N/A';
        if(ownerDeceasedStatusSpan) ownerDeceasedStatusSpan.textContent = 'N/A';
        if(contractBalanceSpan) contractBalanceSpan.textContent = 'N/A';
        if(unlockTimeRow) unlockTimeRow.style.display = 'none';
        if(checkBalanceBtn) { checkBalanceBtn.disabled = true; checkBalanceBtn.innerHTML = originalButtonContent.checkBalance; }
        // Heirs list
        if(heirsListDiv) heirsListDiv.innerHTML = '<p>Подключите кошелек для просмотра списка.</p>';
        // Action Sections - Hide All
        manageSectionVisibility(ownerActionsSection, false);
        manageSectionVisibility(preparationSection, false);
        manageSectionVisibility(heirWithdrawSection, false);
        // Reset button states within hidden sections to default (disabled, original content)
        if(addHeirBtn) { addHeirBtn.disabled = true; addHeirBtn.innerHTML = originalButtonContent.addHeir; }
        if(depositBtn) { depositBtn.disabled = true; depositBtn.innerHTML = originalButtonContent.deposit; }
        if(markDeceasedBtn) { markDeceasedBtn.disabled = true; markDeceasedBtn.innerHTML = originalButtonContent.markDeceased; }
        if(prepareDistributionBtn) { prepareDistributionBtn.disabled = true; prepareDistributionBtn.innerHTML = originalButtonContent.prepareDistribution; }
        if(withdrawShareBtn) { withdrawShareBtn.disabled = true; withdrawShareBtn.innerHTML = originalButtonContent.withdrawShare; }
        // Clear listener flags
        if(ownerActionsSection) delete ownerActionsSection.dataset.listenersAttached;
        if(preparationSection) delete preparationSection.dataset.listenersAttached;
        if(heirWithdrawSection) delete heirWithdrawSection.dataset.listenersAttached;
        console.log("UI Reset complete.");
    }

    // Refresh all dynamic data and update UI
    async function refreshAllData() {
        if (!contract || !userAccount) { await resetUI(); return; } // Use await for resetUI
        console.log("Обновление данных..."); if(statusMessageSpan) statusMessageSpan.textContent = "Обновление...";
        // Fetch all necessary data concurrently
        await Promise.all([
            updateContractData(),       // Fetches status, balance, unlock time
            displayHeirs(),             // Fetches heir list including pending amounts
            updateUserWithdrawalStatus()// Fetches current user's specific pending amount
        ]);
        // Update UI based on newly fetched data (needs to be async now)
        await updateUIBasedOnState();
        if(statusMessageSpan) statusMessageSpan.textContent = "Подключен";
        console.log("Данные обновлены.");
    }

     // --- Helper Functions ---
     function formatTimestamp(unixTimestamp) {
         if (!unixTimestamp || unixTimestamp === 0) return 'N/A';
         try {
             const date = new Date(unixTimestamp * 1000);
             if (isNaN(date.getTime())) return 'Неверная дата';
             // Use options for clearer formatting
             return date.toLocaleString('ru-RU', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit' // Removed second and timeZoneName
             });
         } catch (e) { console.error("Error formatting timestamp:", e); return 'Ошибка даты'; }
     }

     function isUserOwner() {
         // Ensure both values exist and compare case-insensitively
         return contractOwner && userAccount && userAccount.toLowerCase() === contractOwner.toLowerCase();
     }

     // Helper to show loading state on buttons
     function showProcessing(buttonElement, isProcessing, loadingText = "Обработка...") {
         if (!buttonElement) return;
         const buttonId = buttonElement.id; // Get ID to find original content

         if (isProcessing) {
             buttonElement.disabled = true;
             // Make sure original content map has entry for this button ID
             if(!originalButtonContent[buttonId]) originalButtonContent[buttonId] = buttonElement.innerHTML; // Store if missing
             buttonElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
         } else {
             buttonElement.disabled = false;
             // Restore original content using the stored map
             buttonElement.innerHTML = originalButtonContent[buttonId] || 'Button'; // Fallback if ID somehow missing
         }
     }

     // Centralized error handling for transactions
     function handleTransactionError(error, context = "Ошибка транзакции") {
         console.error(`${context}:`, error);
         let displayMessage = error.message || 'Транзакция отклонена или не удалась.';

         // User rejected transaction
         if (error.code === 4001 || (error.message && error.message.includes("User rejected"))) {
             displayMessage = 'Транзакция отменена пользователем.';
             showNotification(displayMessage, 'info');
             return;
         }

         // Try to extract specific revert reasons (checking both message and potential nested error data)
         let revertReason = error.message;
         // Basic checks for custom error names/common reverts
         if (revertReason.includes("NotOwner")) displayMessage = "Действие доступно только владельцу.";
         else if (revertReason.includes("AlreadyDeceased")) displayMessage = "Действие недоступно: владелец уже отмечен как умерший.";
         else if (revertReason.includes("NotDeceased")) displayMessage = "Действие доступно только после отметки о смерти.";
         else if (revertReason.includes("DistributionTimelockNotPassed")) displayMessage = "Срок блокировки для распределения еще не прошел.";
         else if (revertReason.includes("InvalidAddress")) displayMessage = "Указан неверный (нулевой) адрес.";
         else if (revertReason.includes("InvalidShare")) displayMessage = "Неверная доля наследства (должна быть 1-100).";
         else if (revertReason.includes("HeirAlreadyExists")) displayMessage = "Такой наследник уже существует.";
         else if (revertReason.includes("HeirNotFound")) displayMessage = "Наследник не найден.";
         else if (revertReason.includes("NoHeirs")) displayMessage = "Нет зарегистрированных наследников.";
         else if (revertReason.includes("SharesNot100Percent")) displayMessage = "Ошибка: Сумма долей наследников не равна 100%.";
         else if (revertReason.includes("NothingToWithdraw")) displayMessage = "Нет доступных средств для вывода.";
         else if (revertReason.includes("WithdrawalFailed")) displayMessage = "Не удалось отправить средства. Возможно, адрес получателя не может принять ETH.";
         else if (revertReason.includes("DistributionAlreadyPrepared")) displayMessage = "Распределение уже было подготовлено.";
         else if (revertReason.includes("reverted")) {
             displayMessage = "Транзакция отменена контрактом."; // More generic revert
         } else if (revertReason.includes("out of gas")) {
             displayMessage = "Не хватило газа для выполнения транзакции.";
         }
         // Fallback for unknown errors
         else {
              displayMessage = "Произошла неизвестная ошибка транзакции.";
         }


         showNotification(`${context}: ${displayMessage}`, 'error');
     }

    // --- Start the App ---
    console.log("Запуск приложения...");
    initApp();
});
