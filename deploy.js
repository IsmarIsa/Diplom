const Web3 = require('web3');
const fs = require('fs');
const solc = require('solc');

// Подключение к локальной сети Ganache
const web3 = new Web3('http://127.0.0.1:8545');

// Чтение исходного кода контракта
const sourceCode = fs.readFileSync('./contracts/Inheritance.sol', 'utf8');

// Конфигурация компилятора
const input = {
    language: 'Solidity',
    sources: {
        'Inheritance.sol': {
            content: sourceCode
        }
    },
    settings: {
        outputSelection: {
            '*': {
                '*': ['abi', 'evm.bytecode']
            }
        }
    }
};

// Компиляция контракта
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contractName = 'Inheritance';
const bytecode = output.contracts['Inheritance.sol'][contractName].evm.bytecode.object;
const abi = output.contracts['Inheritance.sol'][contractName].abi;

// Деплой контракта
async function deployContract() {
    try {
        // Получаем список аккаунтов
        const accounts = await web3.eth.getAccounts();
        
        // Деплой контракта с начальным взносом (например, 1 ETH)
        const deployValue = web3.utils.toWei('1', 'ether');
        
        const contract = new web3.eth.Contract(abi);
        
        const deployedContract = await contract
            .deploy({ 
                data: '0x' + bytecode 
            })
            .send({ 
                from: accounts[0], 
                value: deployValue,
                gas: 3000000 
            });

        console.log('Контракт успешно развернут');
        console.log('Адрес контракта:', deployedContract.options.address);
        console.log('Владелец контракта:', accounts[0]);

        // Сохраняем информацию о контракте
        const contractInfo = {
            address: deployedContract.options.address,
            abi: abi
        };

        fs.writeFileSync('frontend/contract-info.json', JSON.stringify(contractInfo, null, 2));
        
        console.log('Информация о контракте сохранена в contract-info.json');
    } catch (error) {
        console.error('Ошибка при деплое:', error);
    }
}

deployContract();