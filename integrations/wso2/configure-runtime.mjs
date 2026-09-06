import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const home='/opt/wso2/wso2am-4.7.0';
const credentials='/etc/rehearsal/apim-admin.env';
if(existsSync(credentials)) throw new Error('Existing API Manager credentials found. Preserve them; this script is for first installation only.');
const password=randomBytes(24).toString('hex');
const keystorePassword=randomBytes(24).toString('hex');
const encryptionKey=randomBytes(32).toString('hex');
const env={...process.env,APIM_KEYSTORE_PASSWORD:keystorePassword};
const keytool='/opt/wso2/java/bin/keytool';
const keystore=home+'/repository/resources/security/rehearsal.jks';
execFileSync(keytool,['-genkeypair','-alias','rehearsal','-keyalg','RSA','-keysize','2048','-validity','365','-dname','CN=localhost,OU=Rehearsal,O=Rehearsal,C=LK','-ext','SAN=dns:localhost,ip:127.0.0.1','-storetype','JKS','-keystore',keystore,'-storepass:env','APIM_KEYSTORE_PASSWORD','-keypass:env','APIM_KEYSTORE_PASSWORD'],{env,stdio:'pipe'});
execFileSync(keytool,['-exportcert','-rfc','-alias','rehearsal','-keystore',keystore,'-storepass:env','APIM_KEYSTORE_PASSWORD','-file','/usr/local/share/ca-certificates/rehearsal-apim.crt'],{env,stdio:'pipe'});
execFileSync(keytool,['-importcert','-noprompt','-alias','rehearsal','-file','/usr/local/share/ca-certificates/rehearsal-apim.crt','-keystore',home+'/repository/resources/security/client-truststore.jks','-storepass','wso2carbon'],{stdio:'pipe'});
writeFileSync(credentials,`APIM_ADMIN_PASSWORD=${password}\nAPIM_KEYSTORE_PASSWORD=${keystorePassword}\nAPIM_ENCRYPTION_KEY=${encryptionKey}\n`,{mode:0o600,flag:'wx'});
const path=home+'/repository/conf/deployment.toml';
const original=readFileSync(path,'utf8');
if(!original.includes('password = "admin"')) throw new Error('Unexpected distribution configuration.');
writeFileSync(path+'.rehearsal-original',original,{flag:'wx'});
const tls=`[keystore.tls]\nfile_name = "rehearsal.jks"\ntype = "JKS"\npassword = "$env{APIM_KEYSTORE_PASSWORD}"\nalias = "rehearsal"\nkey_password = "$env{APIM_KEYSTORE_PASSWORD}"\n`;
let config=original.replace('password = "admin"','password = "$env{APIM_ADMIN_PASSWORD}"')
  .replace(/\[keystore\.tls\][\s\S]*?(?=\n#\[keystore\.listener_profile\])/,tls)
  .replace('[apim.ai]\nenable = true','[apim.ai]\nenable = false');
for(const kind of ['primary','internal']) config+=`\n[keystore.${kind}]\nfile_name = "rehearsal.jks"\ntype = "JKS"\npassword = "$env{APIM_KEYSTORE_PASSWORD}"\nalias = "rehearsal"\nkey_password = "$env{APIM_KEYSTORE_PASSWORD}"\n`;
config+='\n[encryption]\nkey = "$env{APIM_ENCRYPTION_KEY}"\n';
writeFileSync(path,config,{mode:0o600});
chmodSync(path,0o600);
console.log('Created private API Manager credentials and a unique localhost certificate.');
