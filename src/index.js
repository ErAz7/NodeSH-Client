import 'colors';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import http from 'http';
import DataChannel from './dataChannel/channel.js';
import CONFIG from './config/constants.js';

const __dirname = path.resolve(path.dirname(''));
const SCREEN_ADDRESS = `${__dirname}/src/tmp/screen.jpg`;

const USAGE_TYPES = {
    CMD: 'cmd',
    CMD_IN: 'cmdIn',
    TRAY: 'tray',
    SCREEN: 'screen'
};

let usageType = 'cmd';
let CHANNEL;
let writeToFile;

// ----------------------------main-----------------------------
console.clear();
console.log("Check 'src/config/contants.js' for port, host and other configurations".cyan.bold);
start();
// -------------------------------------------------------------

function start() {
    CHANNEL = new DataChannel();
    CHANNEL.addEventListener('connection', () => {
        CHANNEL.addEventListener('message', onMessage);
        createConsoleHandler();
    });

    createScreenServer(CONFIG.ports.localScreen);
}

function createConsoleHandler() {
    const rl = readline.createInterface(process.stdin, process.stdout);

    console.log('Current usage type: ' + usageType.magenta.bold);
    rl.on('line', function(line) {
        if (line === 'cls' || line === 'clear') {
            console.clear();

            return;
        }

        if (line === 'q') {
            process.exit(0);
        }

        if (line.trim() === 'change') {
            askType();

            return;
        }

        line = line.split('==>');

        switch (usageType) {
            case USAGE_TYPES.CMD:
                sendCommand({
                    body: line[0]
                }, line[1]);
                break;
            case USAGE_TYPES.CMD_IN:
                sendCommand({
                    body: line[0]
                }, line[1]);
                break;
            case USAGE_TYPES.TRAY:
                sendCommand({
                    body: line[0]
                }, line[1]);
                break;
            case USAGE_TYPES.SCREEN:
                sendCommand({
                    body: line[0]
                }, line[1]);
                break;
            default:
        }
    });

    function askType() {
        rl.question('Enter Type: ', type => {
            if (!Object.keys(USAGE_TYPES).map(key => USAGE_TYPES[key]).includes(type)) {
                console.log('Unknown Type'.bold.red);
                askType();

                return;
            }

            console.log('Usage type Changed To '.white.bold + type.magenta.bold);
            usageType = type;
        });
    }
}

function sendCommand(data, writePath) {
    data.type = usageType;
    writeToFile = writePath;

    CHANNEL.send(data);
}

function onMessage(data) {
    const { body } = data;

    switch (usageType) {
        case USAGE_TYPES.CMD:
        case USAGE_TYPES.CMD_IN:
        case USAGE_TYPES.TRAY:
            console.log(body.replace(/\\r\\n/gi, '\n').bold.cyan);

            if (writeToFile) {
                fs.appendFileSync(writeToFile, JSON.stringify(body));
            }

            writeToFile = null;
            break;
        case USAGE_TYPES.SCREEN:
            fs.writeFileSync(SCREEN_ADDRESS, body, 'binary');
        default:
    }
}

function createScreenServer(port) {
    console.log('Started screen server on port '.cyan.bold + port.toString().magenta.bold);
    http.createServer((req, res) => {
        fs.createReadStream(SCREEN_ADDRESS).pipe(res);
    }).listen(port);
}
