import { IncomingMessage, ServerResponse, createServer  } from 'node:http'
import path from 'node:path'
import url from 'node:url'
import querystring from 'node:querystring'
require('dotenv').config();



const MAX_REQUEST_SIZE = 1024;


import { Mongo } from './Database/Mongo';
import { RedisMock } from './Database/Redis/mock';

export const mongo = new Mongo();
export const redis = new RedisMock();

import {AppointmentCache, OrderCache, OngCache, InMemoryCounter} from './Cache/index'
import { POST } from './Routes/POST';
import { GET } from './Routes/GET';
export const inMemoryCounter = new InMemoryCounter();
export const appointmentCache = new AppointmentCache(inMemoryCounter)
export const orderCache = new OrderCache(inMemoryCounter)
export const ongCache = new OngCache(inMemoryCounter)

import {runScenario } from './Test/setUpDb'

// setTimeout(() => {
//     runScenario()
// }, 6000);

createServer(async (req: IncomingMessage, res: ServerResponse) => {
    
    try {
        res.setHeader('Access-Control-Allow-Origin', `${process.env.ORIGIN}`);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization');

        const METHOD = req.method;
    
        if (!req.url) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('No url specified in request');
        }

        const URL = url.parse(req.url).pathname;
        const xForwardedFor = req.headers['x-forwarded-for'];
        // console.log('ipaddress: ' + xForwardedFor)
        console.log(URL)

        if (METHOD === 'POST') {
    
            validateHeaderContentSize(req.headers['content-length']);
            
            const body = await getBody(req);
            if (!body) {
                throw new Error("Body não consta na requisição.");
            } else {

                if (URL === '/createorder') POST.createOrder(req, res, body);
                else if (URL === '/account/change') POST.changeInfo(req, res, body);
                else if (URL === '/account/delete') POST.deleteAccount(req, res, body);
                    
                else if (URL === '/makeappointment') POST.makeAppointment(req, res, body);
                else if (URL === '/account/register/ONG') POST.registerOng(req, res, body);
                else if (URL === '/account/register/user') POST.registerUser(req, res, body);
                else if (URL === '/account/login/default') POST.loginZeroWaste(req, res, body);
                else if (URL === '/account/resetpassword') POST.resetPassword(req, res, body);
                    
                else if (URL === '/viewDonations') POST.viewDonations(req, res, body);
                    
                else if (URL === '/getMyLikesOngInfo') POST.getOngsInfoBasedOnIdsForLikes(req, res, body);
                    
                else {
                    throw new Error("Rota não existe.");
                }
                
  
                // else if (URL === '/donation/requestdonation') POST.requestDonation(req,res, body)
                // else if (URL === '/donation/donate') POST.donate(req,res, body)
            }
        
        }


        else if (METHOD === 'GET') {


            if (URL === '/getFive') GET.getDonationsPack(req.url, res) // donations
            else if (URL === '/get/favorites') GET.getFavorites(req, res)
            else if (URL === '/testget') GET.testget(req, res)
            // else if (URL === '/oauth') GET.loginOAuth(req,res)
            // else if (URL === '/account/login/oauth/oauth2callback') GET.OAuthCallBack(req,res)
            
            else if (URL === '/mfa') GET.registerValidation(req.url, res)
            else if (URL === '/profileinfo') GET.profile(req, res)

            
            // my profile info
            else if (URL === '/getMyInfo') GET.getMyInfo(req, res)

            //Ongs
            else if (URL === '/gettenongs') GET.getOngsPack(req.url, res)
        
            // Orders
            else if (URL === '/getordersfrom') GET.getOrdersFromAnOng(req.url, res)
            else if (URL === '/getactiveordersfrom') GET.getActiveOrdersFromAnOng(req.url, res)
            else if (URL === '/getorderandtime') GET.getSingleOrderAndOngTime(req, res)
            else if (URL === '/gettenorders') GET.getOrdersPack(req.url, res)
            else if (URL === '/myorders') GET.getMyOrders(req, res)
            else if (URL === '/myactiveorders') GET.getMyActiveOrders(req, res)
            else if (URL === '/gettwolastorders') GET.retrieveLastTwoOrders(res)
        
            // Appointments
            else if (URL === '/myappointments') GET.getMyAppointments(req, res)
            else if (URL === '/myactiveappointments') GET.getMyActiveAppointments(req, res)
            else if (URL === '/delete/myappointment') GET.deleteMyAppointment(req, res)
            else if (URL === '/getAppointmentsFromMyOrder') GET.getAppointmentsFromMyOrder(req, res)
            
            // Likes
            else if (URL === '/delete/favorites') GET.deleteFavorite(req, res)
            else if (URL === '/like') GET.likeOrder(req, res)
            else if (URL === '/unlike') GET.unlikeOrder(req, res)
            else if (URL === '/mylikedposts') GET.getMyLikedPosts(req, res)
            else if (URL === '/mylikes') GET.getMyLikes(req, res)
            else if (URL === '/myonglikes') GET.getMyOngLikes(req, res)
            else if (URL === '/mostlikedongs') GET.getMostLikedOngs(req, res)
            
            
            else if (URL === '/ongs') GET.getOng(req, res) // public
        


            else if (URL === '/getFiveUsers') GET.getDonationsPack(req.url, res) // donations
            else if (URL === '/userswhodonatedtospecificorder') GET.userswhodonatedtospecificorder(req, res)
       
            // my donations
            else if (URL === '/confirmdonation') GET.confirmDonation(req, res);
            else if (URL === '/getmydonations') GET.getmydonations(req, res);
     
            // else if (URL === '/mydonations') GET.myDonations(req, res);
            else if (URL === '/getMyPDFS') GET.getMyPDFS(req, res)
            // else if (URL === '/getSinglePDF') GET.getSinglePDF(req, res)
            else if (URL === '/filesystem') GET.getSinglePDF(req, res)
        
       
            else {
                throw new Error("Rota não existe.");
            }
        }

    } catch (err) {
        console.log('running catch block' + err)
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return res.end(`Erro: ${err}`);
        }
    

    // res.end();
    

    
}).listen(process.env.BACKEND_PORT, () => console.log('Listening'))


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

function validateHeaderContentSize(contentLength?: string) {
    if (!contentLength) throw new Error("Tamanho do Body não suportado.");
    if (Number(contentLength) < MAX_REQUEST_SIZE) return true;
    throw new Error("Tamanho do Body não suportado.");
}




import express from 'express';
const app = express();

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'angdist')));

// Handle requests for any route by serving the 'index.html' file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'angdist', 'index.html'));
});

// Start the server
app.listen(process.env.FRONTEND_PORT, () => {
  console.log(`Backend running on http://localhost:${process.env.FRONTEND_PORT}`);
});

// docker run --env-file ./.env --restart on-failure -p 4200:4200 -p 3000:3000 -d --name myfull myfullimage
// DOCKER BUILD -T myfullimage .
