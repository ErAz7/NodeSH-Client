console.clear();

const querystring = require('querystring');
const http = require('http');
const readline = require('readline')
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const colors = require('colors');


const secureKeyCreator = require('./encryption/createKey');
const encryption = require('./encryption/encryption');
const CONFIG = require('./config');


var sessionCode = '';
var requestPending = false;
var usageType = 'cmd';




//----------------------------main-----------------------------
secureKeyCreator.communicate(null, () => {
  createConsoleHandler();
  createLocalScreenServer(CONFIG.ports.localScreen);
});
//-------------------------------------------------------------




function createConsoleHandler(){    
    const rl = readline.createInterface(process.stdin, process.stdout);
    console.log("Current usage type: " + usageType.magenta.bold);
    rl.on('line', function(line) {
        var authentication;    
        if(!secureKeyCreator.KEY){
          console.log("Please Wait Until Key Exchange Complete".red.bold);
          return;
        } 
        if(requestPending){
          console.log("Please Wait Until Previous Request Return".red.bold);
          return;
        }
        if(sessionCode == 'false' || !sessionCode){    
          authentication = {
            pass:CONFIG.cred.pass,
            user:CONFIG.cred.user
          };
        }else{
          authentication = {
            pass:'',
            user:''
          };
        }
        if(line.trim() == 'change'){
          rl.question('Enter Type: ', (type) => {
            console.log("Usage type Changed To ".white.bold + type.magenta.bold);
            usageType = type;  
          });
          return;
        }
        
        line = line.split('==>');

        switch(usageType){
          case 'cmd':
            sendCommand({
              user: authentication.user,
              pass: authentication.pass,
              sessionCode: sessionCode,
              command:  line[0],          
            },line[1]);
            break;
          case 'cmdIn':
            sendCommand({
              user: authentication.user,
              pass: authentication.pass,
              sessionCode: sessionCode,
              command:  line[0],          
            },line[1]);
            break;      
          case 'tray':              //this can be done by cmd commands                           
            sendCommand({           //but I've made another command type cause it's really fun
              user: authentication.user,
              pass: authentication.pass,
              sessionCode: sessionCode,              
              command:  line[0],
            },line[1]);
            break;
          case 'upload':
            var pathData = line[0].trim().split(/"|'|`/);
            if(pathData.length != 5)
            {
              console.log('Invalid Syntax'.bold.red);
              return;
            }
            upload({
              user: authentication.user,
              pass: authentication.pass,
              sessionCode: sessionCode,              
              dest: pathData[3],
              enc: pathData[4].trim()
              },
              pathData[1]
            );
            break;
          case 'download':
            var pathData = line[0].trim().split(/"|'|`/);
            if(pathData.length != 5){
              console.log('Invalid Syntax'.bold.red);
              return;
            }
            download({
              user: authentication.user,
              pass: authentication.pass,
              sessionCode: sessionCode,              
              path: pathData[3],
              enc: pathData[4].trim()
              },
              pathData[1]
            );
            break;
          default:
            console.log('Unknown Type'.bold.red);
            return;
            break;
        }  
    });
}





function sendCommand(data, write){  
    data.type = usageType;

    sendPostRequest(CONFIG.ports.command, data, null, false, (checkedResponse, res, stopCheckingChunks) => {
        checkedResponse.message = checkedResponse.message.trim();
        console.log(checkedResponse.message.replace(/\\r\\n/gi,'\n').bold.cyan);
        if(write){
          write = write.trim();console.log(write, checkedResponse.message);
          fs.appendFileSync(write, checkedResponse.message);
        }
    });
  
}




 function upload(data, path){                      
      if (!fs.existsSync(path)) {
        var pathFile = path.replace(/^.*[\\\/]/, '');
        console.log(("File does not exist: '" + path + "', searching default upload directory for '" + pathFile + "'").red.bold);
        path = CONFIG.defaultPath.upload + pathFile;;
        if(!fs.existsSync(path)){
          console.log("File does not exist in default upload directory".red.bold);
          return;
        }
      }            

      requestPending = true;

      if(data.enc != 'no'){
        data.enc = 'yes';
        console.log("Encrypting file...".white.bold);
        encryption.encryptFile(
            path,
            __dirname + '/tmp/outgoingFile.enc',
            secureKeyCreator.KEY,
            () => {              
              sendFile(__dirname + '/tmp/outgoingFile.enc');
            },
            (err) => {
              requestPending = false;
              console.log(JSON.stringify(err).red.bold);
            });
      }else{
      	sendFile(path);
      }
      
      function sendFile(finalPath){
        var dataEnc = encryptObject(data);        

        var form = new FormData();
        form.append('user', dataEnc.user);
        form.append('pass', dataEnc.pass);
        form.append('sessionCode', dataEnc.sessionCode);
        form.append('path', dataEnc.dest);
        form.append('enc', dataEnc.enc);
        form.append('file', fs.createReadStream(finalPath));

        console.log("Sending file...".white.bold);
        
        form.submit('http://' + CONFIG.host + ':' + CONFIG.ports.upload, function(err, res) {

            if(err){
              console.log(JSON.stringify(err).bold.red);            
              return;
            }

            var body = '';

            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;   
                var checkedResponse = checkResponse(body);

                if(checkedResponse !== false){
                  console.log(checkedResponse.message.bold.cyan);
                  body = '';
                } 
            }).on('end', () => {
                requestPending = false;
                if(fs.existsSync(__dirname + '/tmp/outgoingFile.enc')){
                  fs.unlinkSync(__dirname + '/tmp/outgoingFile.enc');
                }
            }).on('error', function(error) {
                requestPending = false;
                if(fs.existsSync(__dirname + '/tmp/outgoingFile.enc')){
                  fs.unlinkSync(__dirname + '/tmp/outgoingFile.enc');
                }
                console.log(JSON.stringify(error).bold.red);                
            });

        });
      }
 }





 function download(data,dest){
    
    if(data.enc != 'no'){
      data.enc = 'yes';
    }

    if (!fs.existsSync(path.dirname(dest))) {

      console.log(("Directory does not exist: '" + dest + "', saving to default download directory...").red.bold);
      
      if(!fs.existsSync(CONFIG.defaultPath.download)){
        console.log("Default download directory does not exist".red.bold);
        return;
      }

      dest = CONFIG.defaultPath.download + '/' +dest.replace(/^.*[\\\/]/, '');

    } 

    console.log("Waiting for server to respond (if this took long, perhaps server is encrypting file to send)".white.bold);
    sendPostRequest(CONFIG.ports.download, data, 500, true, (checkedResponse, res, stopCheckingChunks) => { 
        if(checkedResponse.message == 'stream'){                  
            console.log("Downloading...".white.bold);

            if(data.enc != 'no'){
              res.pipe(fs.createWriteStream(__dirname + '/tmp/incomingFile.enc'))
              .on('close', () => {
                console.log("Download completed, decrypting hard...".green.bold);
                encryption.decryptFile(
                    __dirname + '/tmp/incomingFile.enc',
                    dest,
                    secureKeyCreator.KEY,
                    () => {
                      console.log("Decryption completed".green.bold);
                      if(fs.existsSync(__dirname + '/tmp/incomingFile.enc')){
                        fs.unlinkSync(__dirname + '/tmp/incomingFile.enc');                          
                      }
                    },
                    (err) => {
                      console.log("Decryption failed".red.bold);
                    }
                );  
              })
              .on('err', (err) => {
                console.log(JSON.stringify(err).red.bold);
              });
            }else{
              res.pipe(fs.createWriteStream(dest))
              .on('close',() => {
                console.log("Download completed".green.bold);
              })
              .on('err', (err) => {
                console.log(JSON.stringify(err).red.bold);
              });;
            }
               
            stopCheckingChunks();

        }else{
            console.log(checkedResponse.message.red.bold);
        } 
    });               


 }












function sendPostRequest(port, data, sizeLimit, lock, callBack){

    var dataEnc = encryptObject(data);

    var post_data = querystring.stringify(dataEnc);

    var post_options = {
        host: CONFIG.host,
        port: port,
        path: '',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(post_data)
        }
    };

    

    var post_req = http.request(post_options, function(res) {
        var body = '';       

        res.on('data', checkChunk).on('end', () => {
            requestPending = false;
        });

        function checkChunk(chunk){             
            body += chunk; 
            var checkedResponse = checkResponse(body);

            if(checkedResponse !== false){
              callBack(checkedResponse, res, stopCheckingChunks);

              body = '';
            }else{
              if(sizeLimit && body.length > sizeLimit){
                console.log("No authentication data received".red.bold);
                stopCheckingChunks();
                return;
              }
            }
        }


        function stopCheckingChunks(){
            res.removeListener('data', checkChunk);
        }

    }).on('error', function(error) {
        requestPending = false;
        console.log(JSON.stringify(error).bold.red);          
    });;


    if(lock){
      requestPending = true;
    }
    post_req.write(post_data);
    post_req.end(); 

}




function createLocalScreenServer(port){
    http.createServer((request, response) => { 

        var data = {
            pass:CONFIG.cred.pass,
            user:CONFIG.cred.user,
            sessionCode:sessionCode            
        }
        

        sendPostRequest(CONFIG.ports.screen, data, null, false, (checkedResponse, res, stopCheckingChunks) => {
            if(checkedResponse !== false){
              if(checkedResponse.message !== ''){
                response.statusCode = 200;
                response.end(`
                  <!DOCTYPE html>
                  <html>
                    <body>
                      <img src="data:image/png;base64,${checkedResponse.message}"/>
                    </body>
                  </html>
                `);
              }else{
                response.statusCode = 503;
                response.end();
              }
            }                               
        });
                
    }).listen(port);
}




function checkResponse(stack){
  try{
    var responseJSON = JSON.parse(stack.trim());
    responseJSON = decryptObject(responseJSON);
    if(!responseJSON.message){
      throw null;
    }
  }catch(e){  
    if(stack == '-1'){
      recreateKey();
    }                                
    return false;
  }  

  if(responseJSON.sessionCode){
    sessionCode = responseJSON.sessionCode;
  }

  if(responseJSON.auth == 'false'){
    sessionCode = '';
    secureKeyCreator.reset();
    secureKeyCreator.communicate();
    console.log(responseJSON.message.bgRed.bold);
    return false;
  }

  return responseJSON;
}




function encryptObject(object){
  var objectEnc = {...object};
  var keys = Object.keys(objectEnc);
  for(var i = 0; i < keys.length; i++){
    if(typeof(objectEnc[keys[i]]) == 'object'){
      objectEnc[keys[i]] = encryption.encrypt(JSON.stringify(objectEnc[keys[i]]),secureKeyCreator.KEY);
    }else{
      objectEnc[keys[i]] = encryption.encrypt((objectEnc[keys[i]]),secureKeyCreator.KEY);  
    }
  }
  return objectEnc;
}

function decryptObject(object){
  var objectEnc = {...object};
  var keys = Object.keys(objectEnc);
  for(var i = 0; i < keys.length; i++){
    if(typeof(objectEnc[keys[i]]) == 'object'){
      objectEnc[keys[i]] = encryption.decrypt(JSON.stringify(objectEnc[keys[i]]),secureKeyCreator.KEY);
    }else{
      objectEnc[keys[i]] = encryption.decrypt((objectEnc[keys[i]]),secureKeyCreator.KEY);  
    }
  }
  return objectEnc;
}




function recreateKey(){
  console.log('KEY Requested'.bold.bgRed);
  secureKeyCreator.reset();
  secureKeyCreator.communicate();
}





