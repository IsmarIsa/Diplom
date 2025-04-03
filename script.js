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
    const ownerActionsSection = document.getElementById('ownerActions');
    const addHeirBtn = document.getElementById('addHeirBtn');
    const heirAddressInput = document.getElementById('heirAddressInput');
    const shareInput = document.getElementById('shareInput');
    const depositBtn = document.getElementById('depositBtn');
    const depositAmountInput = document.getElementById('depositAmountInput');
    const markDeceasedBtn = document.getElementById('markDeceasedBtn');
    const distributionSection = document.getElementById('distributionSection');
    const distributeAssetsBtn = document.getElementById('distributeAssetsBtn');
    const heirsListDiv = document.getElementById('heirsList');

    // --- Global Variables ---
    let web3;
    let contract;
    let userAccount;
    let contractInfo;
    // Store original button texts (get initial text content or fallback)
    const originalButtonTexts = {
        connectWallet: connectWalletBtn?.innerHTML || '<i class="fas fa-wallet"></i> Подключить кошелек',
        checkBalance: checkBalanceBtn?.innerHTML || '<i class="fas fa-sync"></i> Обновить баланс',
        addHeir: addHeirBtn?.innerHTML || '<i class="fas fa-user-plus"></i> Добавить',
        deposit: depositBtn?.innerHTML || '<i class="fas fa-coins"></i> Пополнить',
        markDeceased: markDeceasedBtn?.innerHTML || '<i class="fas fa-user-slash"></i> Отметить как умершего',
        distributeAssets: distributeAssetsBtn?.innerHTML || '<i class="fas fa-share-square"></i> Распределить активы',
    };

    // --- Initialization ---
    async function initApp() {
        // Attach initial listeners
        connectWalletBtn?.addEventListener('click', connectWallet);
        disconnectWalletBtn?.addEventListener('click', disconnectWallet);
        checkBalanceBtn?.addEventListener('click', updateContractBalance);
        // Owner/Distribution listeners are attached dynamically in updateUIBasedOnState

        // Load contract info
        try {
            const response = await fetch('contract-info.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            contractInfo = await response.json();
            if (!contractInfo.address || !contractInfo.abi) {
                 throw new Error("Invalid contract-info.json structure.");
            }
            console.log("Contract Info Loaded:", contractInfo.address);
        } catch (error) {
            console.error("Failed to load contract-info.json:", error);
            showNotification("Ошибка: Не удалось загрузить информацию о контракте (contract-info.json).", "error");
            if(statusMessageSpan) statusMessageSpan.textContent = "Ошибка загрузки";
            return;
        }

        // Setup Web3 and listeners
        if (typeof window.ethereum !== 'undefined') {
            web3 = new Web3(window.ethereum);
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', (_chainId) => window.location.reload());

            // Try to connect automatically if already permitted
            const accounts = await web3.eth.getAccounts();
            console.log("Initial accounts found:", accounts.length);
            if (accounts.length > 0) {
                await connectWallet(true); // Auto-connect
            } else {
                 if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек не подключен";
                resetUI(); // Ensure UI is in disconnected state
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
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log("Accounts requested:", accounts);
            // Setup account and contract instance
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
            if (error.code !== 4001) { // Ignore user rejection error
                 showNotification(`Ошибка подключения: ${error.message || error}`, 'error');
            }
            if(statusMessageSpan) statusMessageSpan.textContent = "Ошибка подключения";
            resetUI();
        }
    }

    function disconnectWallet() {
        console.log("Disconnecting wallet...");
        userAccount = null;
        contract = null;
        window.contractOwner = null;
        window.isOwnerDeceased = null;

        resetUI(); // Reset UI to initial disconnected state

        showNotification("Кошелек отключен.", "info");
        if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек отключен";

        // Ensure correct button visibility after resetUI might have been called
        if(connectWalletBtn) connectWalletBtn.style.display = 'inline-flex';
        if(userAccountSpan) userAccountSpan.style.display = 'none';
        if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'none';
    }

    async function setupContractAndAccount(accounts) {
         if (accounts.length > 0) {
            userAccount = accounts[0];
            console.log('Аккаунт установлен:', userAccount);
             if(userAccountSpan) {
                 userAccountSpan.textContent = `${userAccount.substring(0, 6)}...${userAccount.substring(userAccount.length - 4)}`;
                 userAccountSpan.style.display = 'inline-block'; // Show address
             }
             if(connectWalletBtn) connectWalletBtn.style.display = 'none'; // Hide connect button
             if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'inline-flex'; // Show disconnect button

             // Initialize contract if necessary
             if (web3 && contractInfo && (!contract || contract.options.address.toLowerCase() !== contractInfo.address.toLowerCase())) {
                 try {
                    contract = new web3.eth.Contract(contractInfo.abi, contractInfo.address);
                    console.log("Contract instance created/updated:", contract.options.address);
                 } catch (contractError) {
                     console.error("Error creating contract instance:", contractError);
                     showNotification("Ошибка инициализации контракта.", "error");
                     contract = null;
                 }
             }
         } else {
             // No accounts connected
            userAccount = null;
            contract = null;
            console.log("No accounts connected/available.");
             if(userAccountSpan) userAccountSpan.style.display = 'none'; // Hide address
             if(connectWalletBtn) connectWalletBtn.style.display = 'inline-flex'; // Show connect button
             if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'none'; // Hide disconnect button
         }
    }

    async function handleAccountsChanged(accounts) {
         console.log("Accounts changed event:", accounts);
         const hadAccountBefore = !!userAccount;
         await setupContractAndAccount(accounts); // Update account/contract state and header UI

         if (userAccount) {
             console.log("Account present after change, refreshing data.");
             await refreshAllData(); // Refresh data for the new/current account
         } else if (hadAccountBefore) {
             console.log("Account lost after change, resetting UI.");
             resetUI(); // Reset main UI sections if user disconnected from MetaMask
             if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек отключен";
             showNotification("Кошелек был отключен.", "info");
         } else {
             console.log("No account before or after change, ensuring UI is reset.");
             resetUI(); // Ensure UI is reset if there was no account initially
             if(statusMessageSpan) statusMessageSpan.textContent = "Кошелек не подключен";
         }
     }

    // --- Contract Interaction Functions ---

    async function updateOwnerStatus() {
        if (!contract) return;
        console.log("Fetching owner status...");
        try {
            const status = await contract.methods.getOwnerStatus().call();
            window.contractOwner = status[0];
            window.isOwnerDeceased = status[1];
            console.log("Owner:", window.contractOwner, "Deceased:", window.isOwnerDeceased);
            if(ownerAddressSpan) ownerAddressSpan.textContent = window.contractOwner;
            if(ownerDeceasedStatusSpan) ownerDeceasedStatusSpan.textContent = window.isOwnerDeceased ? 'Умер' : 'Жив';
        } catch (error) {
            console.error('Ошибка получения статуса владельца:', error);
            showNotification('Не удалось получить статус владельца.', 'error');
            if(ownerAddressSpan) ownerAddressSpan.textContent = 'Ошибка';
            if(ownerDeceasedStatusSpan) ownerDeceasedStatusSpan.textContent = 'Ошибка';
        }
    }

    async function updateContractBalance() {
        if (!contract || !checkBalanceBtn) return;
        console.log("Fetching contract balance...");
        checkBalanceBtn.disabled = true;
        checkBalanceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обновление...'; // Show loading state
        try {
            const balanceWei = await web3.eth.getBalance(contractInfo.address);
            const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
            console.log("Balance:", balanceEth, "ETH");
            if(contractBalanceSpan) contractBalanceSpan.textContent = parseFloat(balanceEth).toFixed(4);
        } catch (error) {
            console.error('Ошибка проверки баланса:', error);
            showNotification('Не удалось проверить баланс контракта.', 'error');
            if(contractBalanceSpan) contractBalanceSpan.textContent = 'Ошибка';
        } finally {
            checkBalanceBtn.disabled = false;
            checkBalanceBtn.innerHTML = originalButtonTexts.checkBalance; // Restore original text/icon
        }
    }

    async function displayHeirs() {
        if (!contract || !heirsListDiv) return;
        console.log("Fetching heirs list...");
        try {
            const heirsData = await contract.methods.getAllHeirs().call();
            const addresses = heirsData[0];
            const shares = heirsData[1];

            if (addresses.length === 0) {
                heirsListDiv.innerHTML = '<p>Наследники еще не добавлены.</p>';
                return;
            }

            let listHtml = '<ul>';
            addresses.forEach((address, index) => {
                listHtml += `
                    <li>
                        <span class="heir-address">${address}</span>
                        <span class="heir-share">Доля: ${shares[index]}%</span>
                    </li>`;
            });
            listHtml += '</ul>';
            heirsListDiv.innerHTML = listHtml;
            console.log("Heirs list displayed:", addresses.length);

        } catch (error) {
            console.error('Ошибка получения списка наследников:', error);
            showNotification('Не удалось загрузить список наследников.', 'error');
            heirsListDiv.innerHTML = '<p>Ошибка загрузки списка наследников.</p>';
        }
    }

    async function addHeir() {
        if (!contract || !userAccount) return showNotification('Сначала подключите кошелек.', 'warning');
        if (!window.contractOwner || userAccount.toLowerCase() !== window.contractOwner.toLowerCase()) return showNotification('Только владелец контракта может добавлять наследников.', 'warning');
        if (!addHeirBtn || !heirAddressInput || !shareInput) return; // Safety check for elements

        const heirAddress = heirAddressInput.value.trim();
        const share = shareInput.value.trim();

        if (!web3.utils.isAddress(heirAddress)) return showNotification('Введите корректный адрес наследника.', 'error');
        const shareInt = parseInt(share);
        if (!share || isNaN(shareInt) || shareInt <= 0 || shareInt > 100) return showNotification('Введите корректную долю наследства (1-100).', 'error');

        showNotification('Отправка транзакции...', 'info', false);
        addHeirBtn.disabled = true;
        addHeirBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';

        try {
            await contract.methods.addHeir(heirAddress, share).send({ from: userAccount });
            showNotification('Наследник успешно добавлен!', 'success');
            heirAddressInput.value = '';
            shareInput.value = '';
            await displayHeirs(); // Refresh list
        } catch (error) {
            console.error('Ошибка добавления наследника:', error);
             if (error.code !== 4001) {
                 showNotification(`Ошибка добавления наследника: ${error.message || 'Транзакция отклонена'}`, 'error');
             } else {
                 showNotification('Транзакция отменена пользователем.', 'info');
             }
        } finally {
            addHeirBtn.disabled = false;
            addHeirBtn.innerHTML = originalButtonTexts.addHeir;
        }
    }

     async function depositFunds() {
         if (!contract || !userAccount) return showNotification('Сначала подключите кошелек.', 'warning');
         if (!window.contractOwner || userAccount.toLowerCase() !== window.contractOwner.toLowerCase()) return showNotification('Только владелец контракта может пополнять баланс.', 'warning');
         if (!depositBtn || !depositAmountInput) return;

         const amountEth = depositAmountInput.value.trim();
         if (!amountEth || parseFloat(amountEth) <= 0) return showNotification('Введите корректную сумму для пополнения.', 'error');

         const amountWei = web3.utils.toWei(amountEth, 'ether');

         showNotification('Отправка транзакции...', 'info', false);
         depositBtn.disabled = true;
         depositBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Пополнение...';

         try {
             await contract.methods.depositInheritance().send({ from: userAccount, value: amountWei });
             showNotification('Баланс контракта успешно пополнен!', 'success');
             depositAmountInput.value = '';
             await updateContractBalance(); // Refresh balance display
         } catch (error) {
             console.error('Ошибка пополнения:', error);
             if (error.code !== 4001) {
                 showNotification(`Ошибка пополнения: ${error.message || 'Транзакция отклонена'}`, 'error');
             } else {
                 showNotification('Транзакция отменена пользователем.', 'info');
             }
         } finally {
             depositBtn.disabled = false;
             depositBtn.innerHTML = originalButtonTexts.deposit;
         }
    }

    async function markAsDeceased() {
        if (!contract || !userAccount) return showNotification('Сначала подключите кошелек.', 'warning');
        if (!window.contractOwner || userAccount.toLowerCase() !== window.contractOwner.toLowerCase()) return showNotification('Только владелец контракта может выполнить это действие.', 'warning');
        if (window.isOwnerDeceased) return showNotification('Владелец уже отмечен как умерший.', 'info');
        if (!markDeceasedBtn) return;

        showNotification('Отправка транзакции...', 'info', false);
        markDeceasedBtn.disabled = true;
        markDeceasedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отметка...';

        try {
            await contract.methods.markAsDeceased().send({ from: userAccount });
            showNotification('Статус владельца успешно изменен на "умер".', 'success');
            await updateOwnerStatus(); // Refresh status
            updateUIBasedOnState(); // Update UI based on new status
        } catch (error) {
            console.error('Ошибка отметки как умершего:', error);
            if (error.code !== 4001) {
                showNotification(`Ошибка изменения статуса: ${error.message || 'Транзакция отклонена'}`, 'error');
            } else {
                showNotification('Транзакция отменена пользователем.', 'info');
            }
             // Button state/visibility handled by updateUIBasedOnState, but restore text just in case
            markDeceasedBtn.disabled = false; // Temporarily re-enable before potential hide
            markDeceasedBtn.innerHTML = originalButtonTexts.markDeceased;

        }
    }

    async function distributeAssets() {
        if (!contract || !userAccount) return showNotification('Сначала подключите кошелек.', 'warning');
        if (!window.isOwnerDeceased) return showNotification('Активы можно распределить только после отметки владельца как умершего.', 'warning');
        if (!distributeAssetsBtn) return;


        showNotification('Отправка транзакции...', 'info', false);
        distributeAssetsBtn.disabled = true;
        distributeAssetsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Распределение...';

        try {
            // Optional: Pre-flight checks (can consume extra RPC calls)
            const heirsData = await contract.methods.getAllHeirs().call();
            const shares = heirsData[1];
            if (shares.length === 0) throw new Error("Нет наследников для распределения.");
            let totalShares = 0;
            shares.forEach(share => { totalShares += parseInt(share); });
            if (totalShares !== 100) throw new Error("Сумма долей наследников не равна 100%.");
            const contractBalanceWei = await web3.eth.getBalance(contractInfo.address);
             if (parseInt(contractBalanceWei) === 0) throw new Error("На балансе контракта нет средств для распределения.");

            // Send transaction
            await contract.methods.distributeAssets().send({ from: userAccount }); // Anyone connected can trigger if owner is deceased
            showNotification('Активы успешно распределены!', 'success');
            await updateContractBalance(); // Balance should be ~0
            await displayHeirs();
            updateUIBasedOnState();
        } catch (error) {
            console.error('Ошибка распределения активов:', error);
            let errorMessage = error.message || 'Транзакция отклонена';
            if (error.code === 4001) {
                 errorMessage = 'Транзакция отменена пользователем.';
                 showNotification(errorMessage, 'info');
            } else if (errorMessage.includes("Total shares must equal 100%")) {
                errorMessage = 'Ошибка: Сумма долей наследников не равна 100%.';
                showNotification(errorMessage, 'error', true);
            } else if (errorMessage.includes("No heirs defined")) {
                 errorMessage = 'Ошибка: Нет наследников для распределения.';
                 showNotification(errorMessage, 'error', true);
            } else if (errorMessage.includes("No assets to distribute")) {
                errorMessage = 'Ошибка: На балансе контракта нет средств для распределения.';
                showNotification(errorMessage, 'error', true);
            } else {
                 // Try to extract revert reason if available
                 const revertReason = error.message.match(/revert (.*)/);
                 if(revertReason && revertReason[1]) {
                     showNotification(`Ошибка распределения: ${revertReason[1]}`, 'error');
                 } else {
                     showNotification(`Ошибка распределения: ${errorMessage}`, 'error');
                 }
            }
        } finally {
            distributeAssetsBtn.disabled = false;
            distributeAssetsBtn.innerHTML = originalButtonTexts.distributeAssets;
        }
    }

    // --- UI Update Functions ---

    function showNotification(message, type = 'info', autoClose = true) {
        if (!notificationsDiv) return;
        // Simple implementation: replace content
        notificationsDiv.innerHTML = `${message} <button onclick="this.parentElement.style.display='none'" style="background:none; border:none; color:inherit; font-size:1.2em; cursor:pointer; padding-left:10px;">×</button>`;
        notificationsDiv.className = `notifications ${type}`;
        notificationsDiv.style.display = 'flex';

        // Clear previous timer
        if (notificationsDiv.timer) clearTimeout(notificationsDiv.timer);

        if (autoClose) {
            const delay = (type === 'error' || type === 'warning') ? 8000 : 5000;
            notificationsDiv.timer = setTimeout(() => {
                 notificationsDiv.style.display = 'none';
                 notificationsDiv.timer = null;
            }, delay);
        }
    }

     // Updates visibility and button states based on connection and contract status
    function updateUIBasedOnState() {
        if (!contract || !userAccount) {
             console.log("updateUIBasedOnState: No contract or userAccount, resetting.");
             resetUI(); // Ensure reset if called without connection
             return;
        }
        console.log("updateUIBasedOnState: Updating UI...");

        const isConnected = true; // We know userAccount and contract exist here
        const isOwner = window.contractOwner && userAccount.toLowerCase() === window.contractOwner.toLowerCase();

        // Enable/Disable balance button
        if(checkBalanceBtn) checkBalanceBtn.disabled = !isConnected;

         // Owner Actions Section visibility and button states
         const showOwnerActions = isConnected && isOwner && !window.isOwnerDeceased;
         if(ownerActionsSection) ownerActionsSection.style.display = showOwnerActions ? 'block' : 'none';
         if (showOwnerActions) {
             if(addHeirBtn) addHeirBtn.disabled = false;
             if(depositBtn) depositBtn.disabled = false;
             if(markDeceasedBtn) markDeceasedBtn.disabled = false;
             // Attach listeners only once
             if (ownerActionsSection && !ownerActionsSection.dataset.listenersAttached) {
                 addHeirBtn?.addEventListener('click', addHeir);
                 depositBtn?.addEventListener('click', depositFunds);
                 markDeceasedBtn?.addEventListener('click', markAsDeceased);
                 ownerActionsSection.dataset.listenersAttached = 'true';
                 console.log("Owner action listeners attached.");
            }
         } else {
              // Disable buttons even if section is hidden (belt-and-suspenders)
             if(addHeirBtn) addHeirBtn.disabled = true;
             if(depositBtn) depositBtn.disabled = true;
             if(markDeceasedBtn) markDeceasedBtn.disabled = true;
              // Remove flag if hidden (optional, helps re-attach if state flips)
              if (ownerActionsSection?.dataset.listenersAttached) {
                  delete ownerActionsSection.dataset.listenersAttached;
                  console.log("Owner action listeners flag removed.");
              }
         }

         // Distribution Section visibility and button state
         const showDistribution = isConnected && window.isOwnerDeceased;
         if(distributionSection) distributionSection.style.display = showDistribution ? 'block' : 'none';
         if (showDistribution) {
             if(distributeAssetsBtn) distributeAssetsBtn.disabled = false;
             if (distributionSection && !distributionSection.dataset.listenersAttached) {
                 distributeAssetsBtn?.addEventListener('click', distributeAssets);
                 distributionSection.dataset.listenersAttached = 'true';
                 console.log("Distribution listener attached.");
             }
         } else {
             if(distributeAssetsBtn) distributeAssetsBtn.disabled = true;
             if (distributionSection?.dataset.listenersAttached) {
                 delete distributionSection.dataset.listenersAttached;
                 console.log("Distribution listener flag removed.");
             }
         }
         console.log("updateUIBasedOnState: UI update complete.");
    }

    // Reset UI to initial disconnected state
    function resetUI() {
        console.log("Resetting UI...");

        // Header state
        if(userAccountSpan) userAccountSpan.textContent = '';
        if(userAccountSpan) userAccountSpan.style.display = 'none';
        if(connectWalletBtn) {
            connectWalletBtn.innerHTML = originalButtonTexts.connectWallet;
            connectWalletBtn.style.display = 'inline-flex';
        }
        if(disconnectWalletBtn) disconnectWalletBtn.style.display = 'none';

        // Contract Info section
        if(statusMessageSpan) statusMessageSpan.textContent = "Не подключен";
        if(ownerAddressSpan) ownerAddressSpan.textContent = 'N/A';
        if(ownerDeceasedStatusSpan) ownerDeceasedStatusSpan.textContent = 'N/A';
        if(contractBalanceSpan) contractBalanceSpan.textContent = 'N/A';
        if(checkBalanceBtn) {
             checkBalanceBtn.disabled = true;
             checkBalanceBtn.innerHTML = originalButtonTexts.checkBalance;
        }

        // Heirs list
        if(heirsListDiv) heirsListDiv.innerHTML = '<p>Подключите кошелек для просмотра списка.</p>';

        // Hide action sections
        if(ownerActionsSection) ownerActionsSection.style.display = 'none';
        if(distributionSection) distributionSection.style.display = 'none';

        // Disable action buttons and reset text
        if(addHeirBtn) { addHeirBtn.disabled = true; addHeirBtn.innerHTML = originalButtonTexts.addHeir; }
        if(depositBtn) { depositBtn.disabled = true; depositBtn.innerHTML = originalButtonTexts.deposit; }
        if(markDeceasedBtn) { markDeceasedBtn.disabled = true; markDeceasedBtn.innerHTML = originalButtonTexts.markDeceased; }
        if(distributeAssetsBtn) { distributeAssetsBtn.disabled = true; distributeAssetsBtn.innerHTML = originalButtonTexts.distributeAssets; }

        // Clear listener flags
        if(ownerActionsSection) delete ownerActionsSection.dataset.listenersAttached;
        if(distributionSection) delete distributionSection.dataset.listenersAttached;

        console.log("UI Reset complete.");
    }

    // Refresh all dynamic data and update UI
    async function refreshAllData() {
        if (!contract || !userAccount) {
             console.log("refreshAllData: No contract or userAccount, cannot refresh.");
             // Ensure UI reflects disconnected state if called inappropriately
             if (!userAccount) resetUI();
             return;
        }
        console.log("refreshAllData: Starting data refresh...");
        if(statusMessageSpan) statusMessageSpan.textContent = "Обновление данных...";

        // Perform fetches in parallel where possible
        await Promise.all([
            updateOwnerStatus(),
            updateContractBalance(),
            displayHeirs()
        ]);

        updateUIBasedOnState(); // Update button visibility/state based on fetched data
        if(statusMessageSpan) statusMessageSpan.textContent = "Подключен";
        console.log("refreshAllData: Data refresh complete.");
    }

    // --- Start the App ---
    console.log("Initializing App...");
    initApp();
});