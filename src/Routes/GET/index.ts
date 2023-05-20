import { IncomingMessage, ServerResponse } from 'http'
import url from 'node:url'
import querystring from 'node:querystring'
import { Sanitaze } from '../../Utils/sanitaze';
import { appointmentCache, mongo, orderCache, redis } from '../..';
import { MyDate } from '../../Utils/MyDate';

import { google } from 'googleapis';
import { oauth2Client, scopes } from '../../OAuth/google'
import { AccessTokenVerification } from '../../Middlewares';
import {cachedOngs, cachedOrderesForFavorites, cachedUsersWhoDonatedAndDonatedItems} from '../../Cache/index'
import { ObjectId } from 'mongodb';

  


const blackList: string[] = [] //code_path
const testget = async (req: IncomingMessage, res: ServerResponse) => {
    console.log('ok from testget');
    res.end()
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

        const isError = Sanitaze.sanitazeCodePath(code_path.toString())
        if (isError) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Error Sanitazing: ' + isError)
        }

        const is_code_path_blacklisted = blackList.includes(code_path.toString())

        if (is_code_path_blacklisted) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('This code has been stacked and it has been now blacklisted')
        }
            
        const entity = await redis.getVerification(code_path.toString());
        if (!entity) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Your code might have been expired')
        }
            
            if (entity.type === 'ong') {
                const inserted_id = await mongo.insertOneOng({ ...entity, created_at: MyDate.getCurrentDateAndTime() });
                if (!inserted_id) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Something went wrong')
                }
            } else if (entity.type === 'user') {
                const inserted_id = await mongo.insertOneUser({ ...entity, created_at: MyDate.getCurrentDateAndTime() });
                if (!inserted_id) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Something went wrong')
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Something went wrong')
            }
            blackList.push(code_path.toString())
            await redis.deleteVerification(code_path.toString());
            res.writeHead(200, {'Content-Type': 'text/plain'});
            return res.end('Welcome, Successfully created!')

        
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

const getSingleOrder = async (req: IncomingMessage, res: ServerResponse) => {
    const req_url: any = req.url
    const parsedUrl = url.parse(req_url);
    let order_id: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }
    const isOrderCached = cachedOrderesForFavorites.find((el: any) => { return el._id.toString() == order_id.toString() })
    if (isOrderCached) {
        console.log('from cache')
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(isOrderCached))
    } else {
        
        const orderFound = await mongo.findOneOrderById(order_id)
        if (!orderFound) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Order does not exist')
        }
        console.log('from databse')
        cachedOrderesForFavorites.push(orderFound)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(orderFound))
    }

}


const loginOAuth = async (req: IncomingMessage, res: ServerResponse) => { 
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
    console.log(url)
    res.writeHead(303, { 'Location': url});
    res.end();
}

const OAuthCallBack = async (req: IncomingMessage, res: ServerResponse) => {
        let google_code : any;
        if (req.url) {
            const { code } = url.parse(req.url, true).query;
            google_code = code;
        }
    
        if (!google_code){
            return res.end('no info provided or invalid')
        }
    
        try{
            const { tokens }: any = await oauth2Client.getToken(google_code);
         
            oauth2Client.setCredentials(tokens);
            const people = google.people({ version: 'v1', auth: oauth2Client });
    
            const { data }: any = await people.people.get({
                resourceName: 'people/me',
                personFields: 'addresses,names,emailAddresses,photos'
            });
    
            const google_email = data.emailAddresses[0].value;
            const google_profilePicUrl = data.photos[0].url;
            const google_name = data.names.displayName;
            const user = {
                name: google_name,
                email: google_email,
                picture: google_profilePicUrl
            }

            //save session
            
            //saveuser on mongo
            const foundEntity = mongo.findOneOngOrUserWhereOR(user.email);
            if (!foundEntity) {
                const inserted_id = await mongo.insertOneUser({ ...user, created_at: MyDate.getCurrentDateAndTime() });
                if (!inserted_id) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Something went wrong on mongodb user insertion')
                }
                const saved = redis.storeGoogleSession(tokens.access_token, {refresh_token: tokens.refresh_token, ...user, id: inserted_id});
                if (!saved) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Something went wrong on redis access-token insertion')
                }
            }
            
            res.setHeader('Set-Cookie', [
                `access_token=Google ${tokens.access_token}; path=/; max-age=86400`, // 1 Day
                `refresh_token=Google ${tokens.refresh_token}; path=/; max-age=86400`
            ]);

            res.writeHead(302, { 'Location': `/test` });
            return res.end()
    } catch(err){
        console.log('catcherr' + err)
        return res.end('not authorized')
    }
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
    const likes = await redis.getLikesOfMultipleOrders(data)

    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({data: data, likes: likes}))
}

const getMyLikes = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        console.log('here')
        const my_likes = await redis.getMyLikes(decoded.id)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        console.log(my_likes)
        return res.end(JSON.stringify(my_likes));
    })
}

const getOngsPack = async (request_url: string, res: ServerResponse) => {
    const parsedUrl = url.parse(request_url);
    let pack: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        pack = queryParams.pack;
    }
    console.log(pack);

    const isError = Sanitaze.sanitazePackNumber(pack)
    if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
    }
    const data: any = await mongo.retrieveFiveOngs(Number(pack))
    redis.getLikesOfMultipleOrders(data)
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({data: data}))
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


const addFavorite = async (req: IncomingMessage, res: ServerResponse) => {

    AccessTokenVerification(req, res, async (decoded: any) => { 
  
    const req_url: any = req.url
    const parsedUrl = url.parse(req_url);
    let order_id: any;
    if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }

    //   const isError = Sanitaze.sanitazePackNumber(order_id)
    //   if (isError) {
    //     res.writeHead(404, { 'Content-Type': 'text/plain' });
    //     return res.end('Error Sanitazing: ' + isError)
    //   }
  
      // if (decoded.type !== 'user') {
      //   res.writeHead(404, { 'Content-Type': 'text/plain' });
      //   return res.end('Ongs can not add to favorites')
      // }
      
      
      const cachedFound = cachedOrderesForFavorites.find((element: any) => { return element._id == order_id })
      
      if (cachedFound) { // it is cached
        console.log('from cache')
        const favoriteAlready = await redis.findFavorite(decoded.id, cachedFound)
        if (favoriteAlready) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end()
        }
        await redis.storeFavorite(decoded.id, cachedFound)
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok')
        
      } else { // not cached
        console.log('from database')
        const orderFound = await mongo.findOneOrderById(order_id)
     
        if (!orderFound) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Order does not exist')
        }
        cachedOrderesForFavorites.push(orderFound)
   
        const favoriteAlready = await redis.findFavorite(decoded.id, orderFound)
        if (favoriteAlready) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end()
        }
        
        redis.storeFavorite(decoded.id, orderFound)
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok')
        
      }
    })
  }

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
      let order_id: any;
      if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }
    // const isError = Sanitaze.sanitazeLoginInfo(body)
    //   if (isError) {
    //     res.writeHead(404, { 'Content-Type': 'text/plain' });
    //     return res.end('Error Sanitazing: ' + isError)
    // }
      await redis.storeLikeIfNotFound(decoded.id, order_id)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('')
    })
  };

  const unlikeOrder = (req: IncomingMessage, res: ServerResponse) => {
    AccessTokenVerification(req, res, async (decoded: any) => {
      const req_url: any = req.url
      const parsedUrl = url.parse(req_url);
      let order_id: any;
      if (parsedUrl.query) {
        const queryParams = querystring.parse(parsedUrl.query);
        order_id = queryParams.order_id;
    }
    // const isError = Sanitaze.sanitazeLoginInfo(body)
    //   if (isError) {
    //     res.writeHead(404, { 'Content-Type': 'text/plain' });
    //     return res.end('Error Sanitazing: ' + isError)
    // }
      await redis.deleteLikeIfFound(decoded.id, order_id)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('')
    })
  };

const getMyOrders = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 
        console.log(decoded.id)
        const foundDocuments = await mongo.findAllCompanyOrders({ owner: new ObjectId(decoded.id) })
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(foundDocuments)) // red
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

    const isOngCached = cachedOngs.find((el: any) => { return el._id.toString() == ong_id.toString() })
    if (isOngCached) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(isOngCached))
    } else {
        const foundOng = await mongo.findOnePublicOng({ _id: new ObjectId(ong_id) })
        if (foundOng) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            cachedOngs.push(foundOng)
            return res.end(JSON.stringify(foundOng))
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(null)
        }
    }
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


const deleteAppointment = async (req: IncomingMessage, res: ServerResponse) => { 
    AccessTokenVerification(req, res, async (decoded: any) => { 

        const req_url: any = req.url
        const parsedUrl = url.parse(req_url);
        let appointment_id: any;
        if (parsedUrl.query) {
            const queryParams = querystring.parse(parsedUrl.query);
            appointment_id = queryParams.appointment_id;
        }

        console.log(appointment_id)
        console.log(decoded.id)

        const deleted = await mongo.deleteAppointment({ _id: new ObjectId(appointment_id), user_parent_id: new ObjectId(decoded.id) })
        if (deleted) {
            res.writeHead(200);
            return res.end()
        }
        res.writeHead(404);
        return res.end()
        
    })
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
            return res.end('This appointment has been confirmed already')
          }

        //   if (appointment.ong_parent_id !== decoded.id) {
        //     res.writeHead(404, { 'Content-Type': 'text/plain' });
        //     return res.end('This appointment does not belong to you')
        //   }

      const updated = await mongo.updateOrderBasedOnAppointmentConfirmation(appointment_id, appointment.items, decoded.id, appointment.order_parent_id.toString())
        if (!updated) {
            res.writeHead(404);
            return res.end()
          }
          
          //update user level cache
          //update order cache
          orderCache.updateOrderById(appointment.order_parent_id.toString(), appointment.items)
          // if it is 100% clear order from ong count
          // clear user appointment
            res.writeHead(200);
            return res.end()
    })
}

function validateItems(requested: number[], donated: number[], being_donated: number[]){
    let err;
    for (let i = 0; requested.length; i++){
        const missing: number = requested[i] - donated[i];
        if (being_donated[i] > missing) {
            err = 'One or many of the items being donated overflows the requested. Do You want to continue?'
        }
    }
    return err;
}
  
  
export const GET = {
    registerValidation,
    loginOAuth,
    OAuthCallBack,
    getDonationsPack,
    getFavorites,
    getSingleOrder,
    profile,
    deleteFavorite,
    addFavorite,
    likeOrder,
    unlikeOrder,
    getOng,
    getMyOrders,
    getOngsPack,
    getMyLikes,
    getMyLikedPosts,
    userswhodonatedtospecificorder,
    deleteAppointment,
    confirmDonation,
    testget
}