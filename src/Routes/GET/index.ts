import { IncomingMessage, ServerResponse } from 'http'
import url from 'node:url'
import path from 'node:path'
import querystring from 'node:querystring'
import { Sanitaze } from '../../Utils/sanitaze';

import { appointmentCache, mongo, ongCache, orderCache, redis } from '../..';
import { MyDate } from '../../Utils/MyDate';

import { google } from 'googleapis';
// import { oauth2Client, scopes } from '../../OAuth/google'
import { AccessTokenVerification } from '../../Middlewares';
import {cachedOngs, cachedOrderesForFavorites, cachedUsersWhoDonatedAndDonatedItems, OrderCache, OutputtedAppointment} from '../../Cache/index'
import { ObjectId } from 'mongodb';

import PDFDocument from 'pdfkit'
import fs from 'fs'
import { GenerateLinkCode } from '../../Utils/generateLink';
import { sendForgetPasswordMail, sendMail } from '../../Utils/Mail';


  


const blackList: string[] = [] //code_path
const testget = async (req: IncomingMessage, res: ServerResponse) => {
    console.log('ok from testget');
    res.end()
}
 
const getMyInfo = async (req: IncomingMessage, res: ServerResponse) => {

    AccessTokenVerification(req, res, async (decoded: any) => {
    
        if (decoded.type === 'ong') {
            const found = await mongo.findOneOngById(decoded.id)
            if (!found) {
                throw new Error("Instituição não encontrada");
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(found))
            }

        } else if (decoded.type === 'user') {
            const found = await mongo.findOneUserById(decoded.id)
            if (!found) {
                throw new Error("Usuario não encontrado");
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(found))
            }
            
        }
        throw new Error("Entidade não encontrada");
        


     })
}



 




const registerValidation = async (request_url: string, res: ServerResponse) => {
    try {
        // const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const parsedUrl = url.parse(request_url);
        if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        const code_path  = queryParams.code_path;
        if (!code_path) {
            res.writeHead(400, {'Content-Type': 'text/plain'});
            return res.end('code path not specified')
        }
        const stringified_code_path = code_path.toString()

        const isError = Sanitaze.sanitazeCodePath(stringified_code_path)
        if (isError) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Error Sanitazing: ' + isError)
        }

            const entity: any | null = await redis.getVerification(stringified_code_path);
            if (!entity) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Your code might have been expired')
            }
            const parsedEntity = JSON.parse(entity)

            if (parsedEntity?.burned) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Your code have been used already, request another one.')
            }
            
            if (parsedEntity.type === 'ong') {
                const found = await mongo.findOneOngWhere({ email: parsedEntity.email })
                if (found) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('User is created already')
                }

                const inserted_id = await mongo.insertOneOng({ ...parsedEntity, created_at: MyDate.getCurrentDateAndTime() });
                if (!inserted_id) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Something went wrong 1')
                }

                redis.burnCodePath(stringified_code_path)

                res.writeHead(200, {'Content-Type': 'text/plain'});
                return res.end()

            }
            

         
            else if (parsedEntity.type === 'user') {
                const foundUser = await mongo.findOneOngOrUserByEmail(parsedEntity.email)
                if (foundUser) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('User is created already')
                }

                const inserted_id = await mongo.insertOneUser({ ...parsedEntity, created_at: MyDate.getCurrentDateAndTime() });
                if (!inserted_id) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Something went wrong 2 ')
                }

                redis.burnCodePath(stringified_code_path)

                res.writeHead(200, {'Content-Type': 'text/plain'});
                return res.end('Welcome, Successfully created!')
             }
         

            res.writeHead(400, {'Content-Type': 'text/plain'});
            return res.end('unexpected')

        
    } else {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        return res.end('url parsing error, please set it properly')
    }
    } catch (err) {
        console.log(err)
        res.writeHead(400, {'Content-Type': 'text/plain'});
        return res.end('Ops... Something went wrong')
     }
}

const getSingleOrderAndOngTime = async (req: IncomingMessage, res: ServerResponse) => {
    const req_url: any = req.url
    const parsedUrl = url.parse(req_url);
    let order_id: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }

    console.log(order_id)

    // const isError = Sanitaze.(pack)
    // if (isError) {
    //     res.writeHead(404, { 'Content-Type': 'text/plain' });
    //     return res.end('Error Sanitazing: ' + isError)
    // }

    // const foundOrder = await orderCache.getOrderById(order_id)
    const foundOrder: any | null = await mongo.findOneOrderById(order_id)

    if (!foundOrder) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Order not found')
    }

    const foundOng = await ongCache.getOngById(foundOrder.owner)
    if (!foundOng) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Ong not found, it might have benn deleted or does not exist.')
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({order: foundOrder, owner: foundOng }))
}

const getActiveOrdersFromAnOng = async (request_url: string, res: ServerResponse) => { 
    const parsedUrl = url.parse(request_url);
    if (parsedUrl.query) {
    const queryParams = querystring.parse(parsedUrl.query);
    const ong_id  = queryParams.ong_id;
        if (!ong_id) {
            res.writeHead(400, {'Content-Type': 'text/plain'});
            return res.end('ong id not specified')
        }
        console.log(ong_id)
        // TODO: sanitaze ong id
        
        
        const ordersFound = await mongo.findAllActiveCompanyOrdersById(ong_id.toString())
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(ordersFound))
        
    }
}



const ipForgetPasswordCounts = new Map();
function protectionAgainstForgetEmailSpam(ip: string): boolean{
  if (ipForgetPasswordCounts.has(ip)) {
    const count = ipForgetPasswordCounts.get(ip);
    
    if (count >= 2) return false
    ipForgetPasswordCounts.set(ip, count + 1);
    return true;

  } else {
    ipForgetPasswordCounts.set(ip, 1);
    return true;
  }
}
const forgetPassword = async (req: IncomingMessage, res: ServerResponse) => {
   
    const req_url: any = req.url
    const parsedUrl = url.parse(req_url);
    let email: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        email = queryParams.email;
    }

    const isError = Sanitaze.sanitazeEmail(email)
    if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
    }

    const entityFound = await mongo.findOneOngOrUserByEmail(email.toLowerCase());
    if (!entityFound) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end(`Nenhuma conta vinculada ao email: ${email}`)
    }

    const path = GenerateLinkCode.generatePath()
    const saved = await redis.storeVerification(path, {email, type: entityFound.type});
      if (!saved) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error while saving your log')
    }
    

        const ipAddress = req.connection.remoteAddress;
    if (!ipAddress) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('IP não consta na requisicão')
    }
    const isSpammed = protectionAgainstForgetEmailSpam(ipAddress);
    if (!isSpammed) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Aguarde um pouco até que voce possa receber outro Email')
    }

    const sent = await sendForgetPasswordMail({ to: email, link: path})
    if (!sent) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Erro inesperado ao enviar email de confirmação')
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end()
}





const getOrdersFromAnOng = async (request_url: string, res: ServerResponse) => {
    const parsedUrl = url.parse(request_url);
    if (parsedUrl.query) {
    const queryParams = querystring.parse(parsedUrl.query);
    const ong_id  = queryParams.ong_id;
        if (!ong_id) {
            res.writeHead(400, {'Content-Type': 'text/plain'});
            return res.end('ong id not specified')
        }
        console.log(ong_id)
        // TODO: sanitaze ong id
        
        
        const ordersFound = await mongo.findAllCompanyOrdersById(ong_id.toString())
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(ordersFound))
        
    }

}



const retrieveLastTwoOrders = async (res: ServerResponse) => { 
    const data: any = await mongo.retrieveLastTwoOrders()
    console.log('dd')
    console.log(data)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data))
}

const getDonationsPack = async (request_url: string, res: ServerResponse) => {
    const parsedUrl = url.parse(request_url);
    let pack: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        pack = queryParams.pack;
    }


    const isError = Sanitaze.sanitazePackNumber(pack)
    if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
    }
    const data: any = await mongo.retrieveFiveItems2(Number(pack))
    const likes = await redis.getLikesOfMultipleOngs(data)

    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({data: data, likes: likes}))
}

const getMyLikes = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const my_likes = await redis.getMyLikes(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(my_likes));
    })
}

const getMyOngLikes = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        if (decoded.type !== 'ong') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Essa conta não pertence à uma Instituição')
        }
        const my_ong_likes = await redis.getMyOngLikes(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(my_ong_likes.toString());
    })
}

const getMostLikedOngs = async (req: IncomingMessage, res: ServerResponse) => { 
    const mostLikedOngs = await redis.getMostLikedOngs()
    const ongs: any = []
    const ongIds = Object.keys(mostLikedOngs);
    ongIds.forEach(async (ongId) => {
        const ongFound = await ongCache.getOngById(ongId)
        const ong = {likedCount: mostLikedOngs[ongId], ongInfo: ongFound }
        ongs.push(ong)
    });
    await Promise.all(ongs);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(ongs));
}

const getOrdersPack = async (request_url: string, res: ServerResponse) => { 
    const parsedUrl = url.parse(request_url);
    let pack: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        pack = queryParams.pack;
    }
    console.log(pack);
    // pack = 1;

    const isError = Sanitaze.sanitazePackNumber(pack)
    if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
    }
    const data: any = await mongo.retrieveFiveOrders(Number(pack))
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({data}))
}

const getOngsPack = async (request_url: string, res: ServerResponse) => {
    const parsedUrl = url.parse(request_url);
    let pack: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        pack = queryParams.pack;
    }
    console.log(pack);
    // pack = 1;

    const isError = Sanitaze.sanitazePackNumber(pack)
    if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
    }
    const data: any = await mongo.retrieveFiveOngs(Number(pack))
    const likes = await redis.getLikesOfMultipleOngs(data)
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({data, likes}))
}


const getFavorites = async (req: IncomingMessage, res: ServerResponse) => {

    AccessTokenVerification(req, res, async (decoded: any) => { 
  
        const favorites = await redis.getFavorites(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(favorites))
      
        
      })
}





const getMyLikedPosts = async (req: IncomingMessage, res: ServerResponse) => {

    AccessTokenVerification(req, res, async (decoded: any) => { 
  
        const myLikes = await redis.getMyLikes(decoded.id)
        const PostsFromMyLikes: any = await Promise.all(myLikes.map(async (like) => {
            const cachedFound = cachedOrderesForFavorites.find((element: any) => { return element._id == like.order_id })
            console.log('cachedFound')
            console.log(cachedFound)
            if (cachedFound) {
                return cachedFound;
            } else {
                const foundOrder = await mongo.findOneOrderById(like.order_id)
                console.log('foundOrder')
                console.log(foundOrder)
                if (foundOrder) {
                    await cachedOrderesForFavorites.push(foundOrder);
                }
                return foundOrder;
            }
        }))
        console.log(PostsFromMyLikes)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(PostsFromMyLikes))
        
      
        
      })
}



// const addFavorite = async (req: IncomingMessage, res: ServerResponse) => {

//     AccessTokenVerification(req, res, async (decoded: any) => { 
  
//     const req_url: any = req.url
//     const parsedUrl = url.parse(req_url);
//     let order_id: any;
//     if (parsedUrl.query) {
//         const queryParams = querystring.parse(parsedUrl.query);
//         order_id = queryParams.order_id;
//     }

//     //   const isError = Sanitaze.sanitazePackNumber(order_id)
//     //   if (isError) {
//     //     res.writeHead(404, { 'Content-Type': 'text/plain' });
//     //     return res.end('Error Sanitazing: ' + isError)
//     //   }
  
//       // if (decoded.type !== 'user') {
//       //   res.writeHead(404, { 'Content-Type': 'text/plain' });
//       //   return res.end('Ongs can not add to favorites')
//       // }
      
      
//       const cachedFound = cachedOrderesForFavorites.find((element: any) => { return element._id == order_id })
      
//       if (cachedFound) { // it is cached
//         console.log('from cache')
//         const favoriteAlready = await redis.findFavorite(decoded.id, cachedFound)
//         if (favoriteAlready) {
//           res.writeHead(200, { 'Content-Type': 'text/plain' });
//           return res.end()
//         }
//         await redis.storeFavorite(decoded.id, cachedFound)
//         res.writeHead(200, { 'Content-Type': 'text/plain' });
//         return res.end('ok')
        
//       } else { // not cached
//         console.log('from database')
//         const orderFound = await mongo.findOneOrderById(order_id)
     
//         if (!orderFound) {
//           res.writeHead(404, { 'Content-Type': 'text/plain' });
//           return res.end('Order does not exist')
//         }
//         cachedOrderesForFavorites.push(orderFound)
   
//         const favoriteAlready = await redis.findFavorite(decoded.id, orderFound)
//         if (favoriteAlready) {
//           res.writeHead(200, { 'Content-Type': 'text/plain' });
//           return res.end()
//         }
        
//         redis.storeFavorite(decoded.id, orderFound)
//         res.writeHead(200, { 'Content-Type': 'text/plain' });
//         return res.end('ok')
        
//       }
//     })
//   }

const deleteFavorite = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
  
      const req_url: any = req.url
      const parsedUrl = url.parse(req_url);
      let order_id: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }
  
    const cachedFound = cachedOrderesForFavorites.find((element: any) => { return element._id == new ObjectId(order_id) })
  
      if (cachedFound) { // it is cached
  
      redis.deleteFavorite(decoded.id, cachedFound)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok')
      
    } else { // not cached
      const orderFound = await mongo.findOneOrderById(order_id)
      if (!orderFound) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Order does not exist')
      }
      cachedOrderesForFavorites.push(orderFound)
      redis.deleteFavorite(decoded.id, orderFound)
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok')
      
    }
  })}


  const likeOrder = (req: IncomingMessage, res: ServerResponse) => {
    AccessTokenVerification(req, res, async (decoded: any) => {
      const req_url: any = req.url
      const parsedUrl = url.parse(req_url);
      let ong_id: any;
      if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        ong_id = queryParams.ong_id;
    }
    // const isError = Sanitaze.sanitazeLoginInfo(body)
    //   if (isError) {
    //     res.writeHead(404, { 'Content-Type': 'text/plain' });
    //     return res.end('Error Sanitazing: ' + isError)
    // }
      await redis.storeLikeIfNotFound(decoded.id, ong_id)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end()
    })
  };

  const unlikeOrder = (req: IncomingMessage, res: ServerResponse) => {
    AccessTokenVerification(req, res, async (decoded: any) => {
      const req_url: any = req.url
      const parsedUrl = url.parse(req_url);
      let ong_id: any;
      if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        ong_id = queryParams.ong_id;
    }
    // const isError = Sanitaze.sanitazeLoginInfo(body)
    //   if (isError) {
    //     res.writeHead(404, { 'Content-Type': 'text/plain' });
    //     return res.end('Error Sanitazing: ' + isError)
    // }
      await redis.deleteLikeIfFound(decoded.id, ong_id)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('')
    })
  };

const getmydonations = async (req: IncomingMessage, res: ServerResponse) => {
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const foundDocuments = await mongo.findMyCompletedDonations(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundDocuments)) // red
    })
}
  

const getMyActiveOrders = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const foundDocuments = await mongo.findAllActiveCompanyOrdersById(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundDocuments)) // red
    })
}

const getMyOrders = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const foundDocuments = await mongo.findAllCompanyOrdersById(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundDocuments)) // red
    })
}

const getAppointmentsFromMyOrder = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => {
        const req_url: any = req.url
        const parsedUrl = url.parse(req_url);
        let order_id: any;
        if (parsedUrl.query) {
            const queryParams = querystring.parse(parsedUrl.query);
            order_id = queryParams.order_id;
        }
        const appointmentsFromOrder = await appointmentCache.getAppointmentsFromOrder(order_id, decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(appointmentsFromOrder)) // red
    })
}


const getMyPDFS = async (req: IncomingMessage, res: ServerResponse) => {
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const myPdfs = await mongo.getMyPDFS(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(myPdfs)) // red
    })

}
const getSinglePDF = async (req: IncomingMessage, res: ServerResponse) => {
    AccessTokenVerification(req, res, async (decoded: any) => {

        //validate if belongs to user

       
     
        const req_url: any = req.url
        const parsedUrl = url.parse(req_url);
        let pdf_id: any;
        if (parsedUrl.query) {
            const queryParams = querystring.parse(parsedUrl.query);
            pdf_id = queryParams.pdf_id;
        }

        // if (decoded.type === 'ong') {
        //     res.writeHead(404, { 'Content-Type': 'application/json' });
        //         return res.end('Only users can access pdfs / recipts.')
        // }

        if (!pdf_id) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end('No ID provided.')
        }
        console.log('pdf_id')
        console.log(pdf_id)

        const foundPdf = await mongo.getPdfById(pdf_id)
        console.log(foundPdf)
        if (foundPdf?._id.toString() !== pdf_id.toString()) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end('Do not belong to you')
        }

        console.log(pdf_id)
        const filePath = path.join(__dirname, `../../filesystem/receipt-${pdf_id}.pdf`);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end('Error reading your file, try again latter on.')
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="file.pdf"');
            res.statusCode = 200;
            res.end(data);
        })
    })

}

const getMyAppointments = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const foundAppointments = await appointmentCache.getAppointmentsFromUserId(decoded.id)
        foundAppointments?.forEach(async appointment => {
            appointment.order_parent = await orderCache.getOrderById(appointment.order_parent_id.toString())
        })
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundAppointments)) // red
    })
}
const getMyActiveAppointments = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        const foundAppointments = await mongo.findActiveAppointmentsFromUserId(decoded.id)
        foundAppointments?.forEach(async appointment => {
            appointment.order_parent = await orderCache.getOrderById(appointment.order_parent_id.toString())
        })
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundAppointments)) // red
    })
}

const deleteMyAppointment = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => {
        const req_url: any = req.url
        const parsedUrl = url.parse(req_url);
        let appointment_id: any;
        if (parsedUrl.query) {
            const queryParams = querystring.parse(parsedUrl.query);
            appointment_id = queryParams.appointment_id;
        }
        if (!appointment_id) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end("Agendamento não fornecido") // red
        }
        
        const foundAppointment = await appointmentCache.getAppointmentById(appointment_id)
        if (!foundAppointment) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end("Agendamento não encontrado.") // red
        }
        if (foundAppointment.user_parent_id.toString() !== decoded.id) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end("Agendamento não pertence à voce") // red
        }
        if (foundAppointment.confirmed) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end("Agendamento já foi confirmado pela Instituição, portanto, não pode ser removido") // red
        }
        
        const deleted = await appointmentCache.deleteAppointmentById(appointment_id)
        if (deleted) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            return res.end()
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Something went wrong') // red
        }
    })
}


const profile = async (req: IncomingMessage, res: ServerResponse) => {

    
    AccessTokenVerification(req, res, async (decoded: any) => {
        console.log('decoded' + JSON.stringify(decoded))
        if (decoded.auth_type === 'zero-waste') {
            if (decoded.type === 'ong') {
                
                const isOngCached = cachedOngs.find((el: any) => { return el._id.toString() == decoded.id.toString() })
                if (isOngCached) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify(isOngCached))
                } else {
                    const foundOng = await mongo.findOnePublicOng({ _id: new ObjectId(decoded.id) })
                    console.log(foundOng)
                    if (!foundOng) {
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        return res.end('Ong not found') // redurect
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        cachedOngs.push(foundOng)
                        return res.end(JSON.stringify({ ...foundOng, image: decoded.image })) // redurect

                    }
                }
            } else { // user

            }
            const foundUser = await mongo.findOneUser({ _id: new ObjectId(decoded.id) })
            if (!foundUser) {
                res.writeHead(303, { 'Content-Type': 'text/plain', 'location': '/test' });
                return res.end('User not found') // redurect
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ...foundUser, image: decoded.image })) // redurect
            

            
        } else if (decoded.auth_type === 'google'){

        }
      
      })
}
const getOng = async (req: IncomingMessage, res: ServerResponse) => {
    //TODO SANITAZE IT
    const req_url: any = req.url
      const parsedUrl = url.parse(req_url);
      let ong_id: any;
      if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        ong_id = queryParams.ong_id;
    }
    const foundOng = await ongCache.getOngById(ong_id)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(foundOng))
}



const userswhodonatedtospecificorder = async (req: IncomingMessage, res: ServerResponse) => {
    //TODO SANITAZE IT

    const req_url: any = req.url
    const parsedUrl = url.parse(req_url);
    let order_id: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }

    let pack = 1
    const foundUsersFromCache = cachedUsersWhoDonatedAndDonatedItems?.find((el: any) => {return (el.order_id === order_id && el.pack === pack) })
    if (foundUsersFromCache) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundUsersFromCache.foundUsers))
    }

    const foundUsers = await mongo.retrieveUsersWhoDonatedToSpecificOrder(order_id);
    console.log('from db foundusers')
    console.log(foundUsers)
    if (foundUsers) {
        cachedUsersWhoDonatedAndDonatedItems.push(
            { order_id, foundUsers, pack: 1 }
        )
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundUsers))
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([]))
    }

}




  const confirmDonation = async (req: IncomingMessage, res: ServerResponse) => { 
      AccessTokenVerification(req, res, async (decoded: any) => {
        
          const req_url: any = req.url
          const parsedUrl = url.parse(req_url);
          let appointment_id: any;
          if (parsedUrl.query) {
              const queryParams = querystring.parse(parsedUrl.query);
              appointment_id = queryParams.appointment_id;
          }
          
          const appointment = await appointmentCache.getAppointmentById(appointment_id)
          if (!appointment) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Appointment not found or has been deleted by the owner') // redurect
          }

          if (appointment.confirmed) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Agendamento já foi confirmado')
          }

        //   if (appointment.ong_parent_id !== decoded.id) {
        //     res.writeHead(404, { 'Content-Type': 'text/plain' });
        //     return res.end('This appointment does not belong to you')
        //   }
        
        
      const updated = await mongo.updateOrderBasedOnAppointmentConfirmation(appointment_id, appointment.items, decoded.id, appointment.order_parent_id.toString(), appointment.user_parent_id.toString(), MyDate.getCurrentDateAndTime())
        if (!updated) {
            res.writeHead(404);
            return res.end()
          }

          const generated = await generatePDF(appointment, updated)
          if (!generated) {
            res.writeHead(404);
            return res.end()
          }
          


            res.writeHead(200);
            return res.end()
    })
}


  
  
export const GET = {
    registerValidation,
    // loginOAuth,
    // OAuthCallBack,
    getDonationsPack,
    retrieveLastTwoOrders,

    getFavorites,
    getSingleOrderAndOngTime,
    getOrdersFromAnOng,

    profile,
    deleteFavorite,
    // addFavorite,
    likeOrder,
    unlikeOrder,
    getOng,
    getMyOrders,
    getMyActiveOrders,
    getMyLikes,
    getMyLikedPosts,
    userswhodonatedtospecificorder,
    deleteMyAppointment,

    getOngsPack,
    getOrdersPack,

    confirmDonation,
    testget,

    getMyAppointments,
    getMyActiveAppointments,

    getMostLikedOngs,
    getAppointmentsFromMyOrder,
    getmydonations,
    
    getMyInfo,

    getActiveOrdersFromAnOng,
    getMyOngLikes,
    getMyPDFS,
    getSinglePDF,

    forgetPassword,
}




async function generatePDF(found: OutputtedAppointment, inserted: any) {

    return new Promise((resolve, reject) => { 
    const doc = new PDFDocument();
    
    const filePath = path.join(__dirname, `../../filesystem/receipt-${inserted}.pdf`);
 
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(20).text('Donation Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Donator: ${found.user_parent_id}`);
    doc.fontSize(12).text(`Para: ${found.ong_parent_id}`);
    doc.fontSize(12).text(`Itens: ${found.items}`);
    doc.moveDown();
    doc.fontSize(12).text(`Date: ${MyDate.getCurrentDateAndTime()}`);
    doc.moveDown();
    doc.fontSize(10).text('Thank you for your support!', { align: 'center' });
    doc.end();

    // Finalize the PDF

    // Handle the finish event
    stream.on('finish', () => {
        console.log('PDF created successfully.');
        resolve(true)
    });
    
    // Handle errors
    doc.on('error', (err) => {
        console.error('Error creating PDF:', err);
        reject()
    });
        
    })
}

