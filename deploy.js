const Web3 = require('web3');
const fs = require('fs');
const solc = require('solc');
const path = require('path');

// --- Конфигурация ---
const GANACHE_RPC_URL = 'http://127.0.0.1:8545';
const CONTRACT_FILE_NAME = 'Inheritance.sol';
const INITIAL_DEPOSIT_ETH = '1'; // !!! Возвращаем начальный депозит !!!
const GAS_LIMIT = '5000000'; // Можно попробовать вернуть 5M, если Ganache позволяет
// const GAS_LIMIT = '7000000'; // Или оставить 7M, если 5М не хватит
// --- Конец конфигурации ---

const web3 = new Web3(GANACHE_RPC_URL);

/**
 * @dev Callback function for solc compiler to find imported files.
 * Handles imports from node_modules and local 'contracts' directory.
 * @param {string} importPath - The path being imported by Solidity (e.g., "@openzeppelin/...")
 * @returns {object} - Object with 'contents' or 'error' property.
 */
function findImports(importPath) {
    // --- Логирование ---
    console.log(`\n[findImports] Attempting to resolve import: '${importPath}'`);
    try {
        // --- Check node_modules ---
        const nodeModulesBase = path.resolve(__dirname, 'node_modules');
        const fullNodeModulesPath = path.join(nodeModulesBase, importPath);

        console.log(`  [findImports] Checking node_modules path: '${fullNodeModulesPath}'`);
        let nodeModulesExists = false;
        try {
            nodeModulesExists = fs.existsSync(fullNodeModulesPath);
            console.log(`  [findImports] fs.existsSync(node_modules path) returned: ${nodeModulesExists}`);
            if (nodeModulesExists) {
                 const stats = fs.statSync(fullNodeModulesPath);
                 if (!stats.isFile()) {
                     console.warn(`  [findImports] Warning: Path exists but is not a file: ${fullNodeModulesPath}`);
                     nodeModulesExists = false;
                 }
            }
        } catch (e) {
            console.warn(`  [findImports] Note: Error checking existence/stats of node_modules path (may be ok): ${e.code || e.message}`);
            nodeModulesExists = false;
        }

        if (nodeModulesExists) {
            try {
                const contents = fs.readFileSync(fullNodeModulesPath, 'utf8');
                console.log(`  [findImports] Successfully read from node_modules.`);
                return { contents: contents };
            } catch (e) {
                 console.error(`  [findImports] Error reading file from node_modules path: ${e}`);
                 return { error: `Error reading file ${importPath} from node_modules: ${e.message}` };
            }
        } else {
             console.log(`  [findImports] Path NOT found or not a file in node_modules.`);
        }

        // --- Check relative to contracts directory ---
        const contractsDir = path.resolve(__dirname, 'contracts');
        const fullLocalPath = path.resolve(contractsDir, importPath);

        console.log(`  [findImports] Checking local contracts path (less likely for libraries): '${fullLocalPath}'`);
         let localExists = false;
         try {
            localExists = fs.existsSync(fullLocalPath);
            console.log(`  [findImports] fs.existsSync(local path) returned: ${localExists}`);
             if (localExists && !fs.statSync(fullLocalPath).isFile()) {
                 console.warn(`  [findImports] Warning: Path exists but is not a file: ${fullLocalPath}`);
                 localExists = false;
            }
         } catch (e) {
             console.warn(`  [findImports] Note: Error checking existence/stats of local path (may be ok): ${e.code || e.message}`);
            localExists = false;
         }

         if (localExists) {
             try {
                 const contents = fs.readFileSync(fullLocalPath, 'utf8');
                 console.log(`  [findImports] Successfully read from local path.`);
                 return { contents: contents };
             } catch (e) {
                 console.error(`  [findImports] Error reading file from local path: ${e}`);
                 return { error: `Error reading file ${importPath} locally: ${e.message}` };
            }
         } else {
             console.log(`  [findImports] Path NOT found or not a file locally.`);
         }

        // --- Not Found ---
        console.error(`  [findImports] FAILED to find import source for: '${importPath}'`);
        return { error: `File not found: ${importPath}. Searched node_modules and contracts directory.` };

    } catch (e) {
        console.error(`  [findImports] Unexpected error in findImports for ${importPath}: ${e.message}\n${e.stack}`);
        return { error: `Unexpected error resolving import: ${e.message}` };
    }
    // --- КОНЕЦ ЛОГИРОВАНИЯ ---
}


/**
 * @dev Reads, compiles, and deploys the Inheritance contract.
 */
async function deployContract() {
    console.log(`Reading contract file: ${CONTRACT_FILE_NAME}...`);
    const contractPath = path.resolve(__dirname, 'contracts', CONTRACT_FILE_NAME);
    if (!fs.existsSync(contractPath)) {
        console.error(`Ошибка: Файл контракта не найден по пути: ${contractPath}`);
        process.exit(1);
    }
    const sourceCode = fs.readFileSync(contractPath, 'utf8');

    // --- Компиляция ---
    console.log('Configuring compiler input...');
    const input = {
        language: 'Solidity',
        sources: {
            [CONTRACT_FILE_NAME]: {
                content: sourceCode
            }
        },
        settings: {
            optimizer: {
                 enabled: true,
                 runs: 200
             },
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode']
                }
            }
        }
    };

    // --- Используем обновленный способ вызова компилятора ---
    console.log('Compiling contract using Standard JSON...');
    let outputJson;
    try {
        outputJson = solc.compile(JSON.stringify(input), { import: findImports });
        console.log('Compilation finished.');
    } catch (compileError) {
        console.error("Критическая ошибка во время компиляции solc.compile:", compileError);
        process.exit(1);
    }

    let output;
    try {
        output = JSON.parse(outputJson);
    } catch (parseError) {
         console.error("Ошибка парсинга JSON вывода компилятора:", parseError);
         console.error("Raw compiler output:", outputJson);
         process.exit(1);
    }
    // --- КОНЕЦ БЛОКА КОМПИЛЯЦИИ ---


    // --- Проверка ошибок компиляции ---
    let compilationFailed = false;
    if (output.errors) {
        console.warn('\nCompilation warnings/errors found:');
        output.errors.forEach((err) => {
            const message = err.formattedMessage;
            if (err.severity === 'error') {
                console.error(`\nERROR: ${message}`);
                compilationFailed = true;
            } else if (err.severity === 'warning') {
                console.warn(`\nWARNING: ${message}`);
            } else {
                console.log(`\nINFO: ${message}`);
            }
        });
         console.log('--- End of compilation messages ---');
    }

    if (compilationFailed) {
        console.error("\nКомпиляция не удалась из-за фатальных ошибок. Деплой отменен.");
        process.exit(1);
    }
    if (!compilationFailed) {
         console.log('\nCompilation successful (or with warnings only).');
    }


    // --- Извлечение ABI и байткода ---
    const contractName = path.basename(CONTRACT_FILE_NAME, '.sol');
    const contractOutput = output.contracts?.[CONTRACT_FILE_NAME]?.[contractName];

    if (!contractOutput?.evm?.bytecode?.object || !contractOutput?.abi) {
         console.error(`\nНе удалось извлечь ABI или байткод для контракта '${contractName}' из вывода компилятора.`);
         if (output.errors) {
             console.error("Compilation messages:", JSON.stringify(output.errors, null, 2));
         } else {
            console.error("Compiler output structure might be unexpected:", JSON.stringify(output, null, 2));
         }
         process.exit(1);
    }

    const bytecode = contractOutput.evm.bytecode.object;
    const abi = contractOutput.abi;
    console.log(`ABI and bytecode for '${contractName}' extracted.`);

    // --- Деплой ---
    console.log(`\nAttempting to deploy '${contractName}' to ${GANACHE_RPC_URL}...`);
    try {
        const accounts = await web3.eth.getAccounts();
        if (accounts.length === 0) {
            throw new Error("No accounts found. Ensure Ganache is running and has accounts.");
        }
        const deployerAccount = accounts[0]; // Используем первый аккаунт по умолчанию
        console.log(`Using deployer account: ${deployerAccount}`);

        // !!! ВОЗВРАЩАЕМ РАСЧЕТ и ИСПОЛЬЗОВАНИЕ deployValueWei !!!
        const deployValueWei = web3.utils.toWei(INITIAL_DEPOSIT_ETH, 'ether');
        console.log(`Initial deposit value: ${INITIAL_DEPOSIT_ETH} ETH (${deployValueWei} wei)`);

        const contract = new web3.eth.Contract(abi);

        console.log("Deploying contract instance... (This may take a moment)");
        const deployedContract = await contract
            .deploy({ data: '0x' + bytecode })
            .send({
                from: deployerAccount,
                value: deployValueWei, // !!! ВОЗВРАЩАЕМ value !!!
                gas: GAS_LIMIT
            })
            .on('transactionHash', function(hash){
                console.log(`Deployment transaction hash: ${hash}`);
            })
            .on('receipt', function(receipt){
                console.log(`Contract mined! Address: ${receipt.contractAddress}`);
            });

        const contractAddress = deployedContract.options.address;
        console.log("Deployment transaction successful.");


        console.log(`\n'${contractName}' deployed successfully!`);
        console.log(`   Contract Address: ${contractAddress}`);
        console.log(`   Owner (Deployer): ${deployerAccount}`);
        const finalBalanceWei = await web3.eth.getBalance(contractAddress);
        console.log(`   Final Balance: ${web3.utils.fromWei(finalBalanceWei, 'ether')} ETH`); // Должен быть равен INITIAL_DEPOSIT_ETH


        // --- Сохранение информации о контракте ---
        const contractInfo = {
            address: contractAddress,
            abi: abi
        };

        const frontendDir = path.resolve(__dirname, 'frontend');
        if (!fs.existsSync(frontendDir)){
            console.log(`Creating directory: ${frontendDir}`);
            fs.mkdirSync(frontendDir);
        }
        const infoPath = path.join(frontendDir, 'contract-info.json');

        fs.writeFileSync(infoPath, JSON.stringify(contractInfo, null, 2));
        console.log(`Contract ABI and address saved to: ${infoPath}`);

    } catch (error) {
        console.error('\n--- Deployment Error ---');
        console.error(`Message: ${error.message}`);
        if (error.receipt) {
            console.error("Receipt (if available):", error.receipt);
        }
        // Подсказки по частым ошибкам
        if (error.message.includes("CONNECTION ERROR") || error.message.includes("Invalid JSON RPC response")) {
             console.error(`\nHint: Could not connect to the blockchain node at ${GANACHE_RPC_URL}. Is Ganache running and accessible?`);
        } else if (error.message.includes("sender doesn't have enough funds")) {
             console.error("\nHint: The deployer account doesn't have enough Ether to cover the deployment gas cost and the initial deposit. Check the balance in Ganache.");
        } else if (error.message.includes("intrinsic gas too low") || error.message.includes("out of gas")) {
            console.error(`\nHint: The gas limit (${GAS_LIMIT}) might be too low for deployment. Try increasing it, or check for infinite loops in constructor/contract logic.`);
        } else if (error.message.includes("nonce too low") || error.message.includes("replacement transaction underpriced")) {
             console.error("\nHint: There might be pending transactions from this account. Try restarting Ganache or resetting the account nonce in MetaMask/Ganache.");
        } else if (error.message.includes("invalid opcode") || error.message.includes("revert")) {
             console.error("\nHint: The contract deployment likely reverted. Check constructor logic or initial state. The error might be inside the contract code itself (e.g., a require statement failed in the constructor).");
        }
         console.error('------------------------');
         process.exit(1);
    }
}

// Запуск процесса деплоя
deployContract();
