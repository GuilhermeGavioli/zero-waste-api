import { IncomingMessage, ServerResponse, createServer  } from 'node:http'
import url from 'node:url'
require('dotenv').config();

const MAX_REQUEST_SIZE = 1024;


import { Mongo } from './Database/Mongo';
import { RedisMock } from './Database/Redis/mock';

export const mongo = new Mongo();
export const redis = new RedisMock();

import {AppointmentCache, OrderCache, OngCache, InMemoryCounter} from './Cache/index'
export const inMemoryCounter = new InMemoryCounter();
export const appointmentCache = new AppointmentCache(inMemoryCounter)
export const orderCache = new OrderCache(inMemoryCounter)
export const ongCache = new OngCache(inMemoryCounter)




createServer(async (req: IncomingMessage, res: ServerResponse) => {
    
    res.setHeader('Access-Control-Allow-Origin', `${process.env.ORIGIN}`);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');

    const METHOD = req.method;
    if (!req.url) {
        res.writeHead(403, {'Content-Type': 'text/plain'});
        return res.end('No url specified in request');
    }
    const parsedUrl = url.parse(req.url);
    const URL = parsedUrl.pathname;


    if (METHOD === 'POST') {
        const contentLength = req.headers['content-length']
        const valid_size = validateHeaderContentSize(contentLength)
        if (!valid_size) {
            res.writeHead(404,{'Content-Type': 'text/plain'})
            return res.end('provided body is too long')
        }
        try {
            const body = await getBody(req)
            if (!body) {
                res.writeHead(403, { 'Content-Type': 'text/plain' })
                console.log('no body provided')
                return res.end('No body provided')
            } else {
                
       
                    console.log('route not found')
                    res.writeHead(405, {'Content-Type': 'text/plain'});
                    return res.end('Route does not exist'); //TODO: 404 ADD PAGE
                
            }
        } catch (err) {
            console.log('catching' + err)
            res.writeHead(403, {'Content-Type': 'text/plain'});
            return res.end('no body provided or bad formated');
        }
        
        
      
    }


    else if (METHOD === 'GET') {
        // const body = await getBody(req)
        // if (body) {
        //     res.writeHead(403, {'Content-Type': 'text/plain'});
        //     return res.end('No need to specify data in the body');
        // }
       
         
            
        
     
            console.log('route not found')
            res.writeHead(403, {'Content-Type': 'text/plain'});
            return res.end('Route does not exist');
        
        
    }

    
}).listen(process.env.PORT, () => console.log('Listening'))


async function getBody(req: IncomingMessage) {
    return new Promise((resolve, reject) => { 
        let body = '';
        console.log('running  get body')
        req.on('data', (chunk: any) => {
            console.log('chunk' + chunk)
            body += chunk;
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject()
            }
        })
    })
}

function validateHeaderContentSize(contentLength?: string): boolean {
    try {
        if (!contentLength) return false;
        if (Number(contentLength) < MAX_REQUEST_SIZE) return true;
        return false;
    } catch (err) {
        console.log('err measuring body size' + err)
        return false;
    }
}




