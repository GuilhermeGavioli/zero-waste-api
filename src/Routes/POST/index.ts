import { IncomingMessage , ServerResponse } from 'http'
import { ObjectId, OrderedBulkOperation } from 'mongodb';



import { GenerateLinkCode } from '../../Utils/generateLink';
import { Worker  } from 'worker_threads';
import { inMemoryCounter, redis } from '../..';
import url from 'node:url'
import querystring from 'node:querystring'

import { MyDate } from '../../Utils/MyDate';

import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { Sanitaze } from '../../Utils/sanitaze';
import { AccessTokenVerification } from '../../Middlewares';

import { mongo, appointmentCache, orderCache, ongCache } from '../../index'

import {Mail, sendMail} from '../../Utils/Mail'
import {cachedOrderesForFavorites, OutputtedOng, OutputtedOrder} from '../../Cache/index'
// import { oauth2Client, scopes } from '../../OAuth/google'

export const donated = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
]


const viewDonations = async (req: IncomingMessage, res: ServerResponse, body: any) => { 
  AccessTokenVerification(req, res, async (decoded: any) => { 
    const worked = await mongo.viewAppointments(body?.ids, decoded.id)
    if (worked) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end()
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end()

  })

}


const changeInfo = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  AccessTokenVerification(req, res, async (decoded: any) => {
    const isError = Sanitaze.sanitazeUserChange(body)
    if (isError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isError)
    }

    if (body.password && !body.confirm_password) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Campo de Confirmaçao de Senha nao provida.')
    }

    if (body.password !== body.confirm_password) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Senhas não são iguais.')
    }


    if (decoded.type === 'user') {
      const found = await mongo.findOneUserById(decoded.id)
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Conta não encontrada.')
      }
  
      const updateObject: any = {};
      if (body.name) {
        updateObject.name = body.name;
      }
      if (body.password) {
        updateObject.password = body.password;
      }
      
      
      const updated = await mongo.updateOneUser(decoded.id, updateObject)
      if (updated) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end()
      } 

      
    } else if (decoded.type === 'ong') {

      const found = await mongo.findOneOngById(decoded.id)
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Conta não encontrada.')
      }
  
      const updateObject: any = {};
      if (body.name) {
        updateObject.name = body.name;
      }
      if (body.password) {
        updateObject.password = body.password;
      }
      
      
      const updated = await mongo.updateOneOng(decoded.id, updateObject)
      if (updated) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end()
      } 
      
    }

    res.writeHead(500, { 'Content-Type': 'text/plain' });
    return res.end('Erro inesperado')


  })
}

const deleteAccount = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  AccessTokenVerification(req, res, async (decoded: any) => { 
    if (decoded.type === 'user') {
      const isError = Sanitaze.sanitazePassword(body)
      if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
      }

      const found = await mongo.findOneUserById(decoded.id)
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Conta não encontrada ou já foi deletada.')
      }

      if (found.password !== body.password) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Senha incorreta.')
      }

      const deleted = await mongo.deleteOneUserById(decoded.id)
      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Algo deu Errado: Erro inesperado ao deletar seu histórico')
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end()
      
    } else if (decoded.type === 'ong') {

      const isError = Sanitaze.sanitazePassword(body)
      if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
      }

      const found: any = await mongo.findOneOngById(decoded.id)
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Conta não encontrada ou já foi deletada.')
      }

      if (found.password !== body.password) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Senha incorreta.')
      }

      const deleted = await mongo.deleteOneOngById(decoded.id)
      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Algo deu Errado: Erro inesperado ao deletar seu histórico')
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end()
      
    }
  })
}

const createOrder = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  AccessTokenVerification(req, res, async (decoded: any) => {

    const isError = Sanitaze.sanitazeOrder2(body)
    if (isError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isError)
    }

    if (decoded.type !== 'ong') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Only ONG accounts can request for donations')
    }

    let total_of_zeros = 0
    for (let i = 0; i < body.items.length; i++) { 
      if (body.items[i] === 0) total_of_zeros++;
    }
    if (total_of_zeros === body.items.length) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('You must provide at least one item to be donated');
    }

    const mongo_object_id = new ObjectId(decoded.id)
    const foundOng = await mongo.findOneOngById(decoded.id)
    if (!foundOng) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      console.log('ong not found')
      return res.end('ONG not found')
    }
   
    const foundOrders: any | null = await mongo.findAllActiveCompanyOrdersById(decoded.id)
    if (foundOrders?.length > 2) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Ongs can only have two active Donations')
    }
    

    body.expires_in = MyDate.getFutureDate(body.expires_in)

    const inserted_id = await orderCache.insertOrder({ ...body, donated, created_at: MyDate.getCurrentDateAndTime(), owner: mongo_object_id })

    if (!inserted_id) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Unexpected Error while inserting')
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('order requested, id: ' + inserted_id)
  })
 }




const getOngsInfoBasedOnIdsForLikes = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  if (!body.ids) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Error Sanitazing: No ongs ids list provided')
  }
  try {
    body.ids.forEach((item: any) => {
      const isError = Sanitaze.sanitazeMongoId(item)
      if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
      }
    })
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Error Sanitazing: ' + err)
  }

  const ongs = await mongo.getManyOngsInfoBasedOnId(body.ids)

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(ongs))
    
  
}



const ipCounts = new Map();

function protectionAgainstEmailSpam(ip: string): boolean{
  console.log(ip)
  if (ipCounts.has(ip)) {
    const count = ipCounts.get(ip);
    
    if (count >= 2) return false
    ipCounts.set(ip, count + 1);
    return true;

  } else {
    ipCounts.set(ip, 1);
    return true;
  }
}




const registerUser = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  const isError = Sanitaze.sanitazeUser(body)
    if (isError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isError)
  }

  if (body.password !== body.confirm_password) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Senhas não são iguais.')
  }

  const userFound = await mongo.findOneOngOrUserByEmail(body.email.toLowerCase());
  if (userFound) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('User already exists')
  }

  const path = GenerateLinkCode.generatePath()
  body.email = body.email.toLowerCase()
  body.name = body.name.toLowerCase()
  const saved = await redis.storeVerification(path, { ...body, type: 'user', xp: 0 });
  if (!saved) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Error while saving your log')
  }

  const ipAddress = req.connection.remoteAddress;
  if (!ipAddress) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('IP não consta na requisicão')
  }
  const isSpammed = protectionAgainstEmailSpam(ipAddress);
  if (!isSpammed) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Aguarde um pouco até que voce possa receber outro Email')
  }

  const sent = await sendMail({ to: body.email, link: path})
  if (!sent) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Erro inesperado ao enviar email de confirmação')
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  return res.end() // TODO: Sent an email
};


const registerOng = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  const isError = Sanitaze.sanitazeOng(body)
    if (isError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isError)
  }

  if (body.password !== body.confirm_password) { 
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Senhas não correspondem')
  }

  // 00:00-00:00
  let err = false;
  try {
    for (const key in body.working_time) {
      const first_time = body.working_time[key].split('-')[0]
      const second_time = body.working_time[key].split('-')[1]
      const first_hour = Number(first_time.split(':')[0])
    const second_hour = Number(second_time.split(':')[0])
    if (first_hour > second_hour) {
      err = true;
      break;
    } else if (first_hour === second_hour) { //check minutes
      const first_minute = Number(first_time.split(':')[1])
      const second_minute = Number(second_time.split(':')[1])
      if (first_minute > second_minute) {
        err = true;
        break;
      }
    }
  }
  } catch (er) {
    err = true;
  }

  if (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Datas de Abertura da Instituição não podem ser maiores que a de fechamento.')
  }

  const entityFound = await mongo.findOneOngOrUserByEmail(body.email.toLowerCase());
  if (entityFound) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Email already exists')
  }

  const path = GenerateLinkCode.generatePath()
  body.email = body.email.toLowerCase()
  body.name = body.name.toLowerCase()

  const saved = await redis.storeVerification(path, { ...body, type: 'ong', xp: 0 });
  if (!saved) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Error while saving your log')
  }

  const ipAddress = req.connection.remoteAddress;
  if (!ipAddress) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('IP não consta na requisicão')
  }

  const isSpammed = protectionAgainstEmailSpam(ipAddress);
  if (!isSpammed) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Aguarde um pouco até que voce possa receber outro Email')
  }

  const sent = await sendMail({ to: body.email, link: path})
  if (!sent) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Erro inesperado ao enviar email de confirmação')
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  return res.end() // TODO: Sent an email
};


// const requestDonation = async (req: IncomingMessage, res: ServerResponse, body: any) => {
//   AccessTokenVerification(req, res, async (decoded: any) => { 

//     const isError = Sanitaze.sanitazeOrder(body)
//     if (isError) {
//       res.writeHead(404, { 'Content-Type': 'text/plain' });
//       return res.end('Error Sanitazing: ' + isError)
//     }

//     if (body.min > body.max) {
//       res.writeHead(404, { 'Content-Type': 'text/plain' });
//       return res.end('Minimum value can not be greater than max')
//     }

//     if (decoded.type !== 'ong') {
//       res.writeHead(404, { 'Content-Type': 'text/plain' });
//       return res.end('Only ONG accounts can request for donations')
//     }

//     const found = await mongo.findOneOng({ _id: new ObjectId(decoded.id) })
    
//     if (!found) {
//       res.writeHead(404, { 'Content-Type': 'text/plain' });
//       return res.end('Company not found')
//     }

//     body.expires_in = MyDate.getFutureDate(body.expires_in)
//     const inserted_id = await mongo.insertOneOrder({ ...body, donated: 0, created_at: MyDate.getCurrentDateAndTime(), owner: decoded.id });
//     if (!inserted_id) {
//       res.writeHead(404, { 'Content-Type': 'text/plain' });
//       return res.end('Unexpected Error while inserting')
//     }
//     res.writeHead(200, { 'Content-Type': 'text/plain' });
//     return res.end('order requested, id: ' + inserted_id)
//   })
// }


const loginZeroWaste = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  try {
    

  const isError = Sanitaze.sanitazeLoginInfo(body)
    if (isError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isError)
  }
  
  // const foundEntity = await mongo.findOneOngOrUserWhereOR({ email: body.email, cnpj: '', phone: '' });
  const foundEntity = await mongo.findOneOngOrUserByEmail(body.email);
  console.log(foundEntity)
  if (!foundEntity) throw new Error('Account does not exist')
  if (body.password !== foundEntity.password) throw new Error('Passwords does not match')
  
  
  const token = jwt.sign({
    id: foundEntity._id.toString(),
    name: foundEntity.name,
    type: foundEntity.type,
    auth_type: 'zero-waste'
  }, `${process.env.JWT}`, {
    // expiresIn: '40s',
    algorithm: 'HS256'
  });
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Authorization', `Bearer ${token}`)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 
  const user_info = {
    id: foundEntity._id,
    type: foundEntity.type,
    name: foundEntity.name,
    image: 'panda.png',
    email: foundEntity.email
  }

  const cookie1 = `access_token=Bearer ${token}; Path=/; Expires=${expires.toUTCString()}`
  const cookie2 = `user=${JSON.stringify(user_info)}; Path=/; Expires=${expires.toUTCString()}`
  res.setHeader('Set-Cookie', [cookie1, cookie2]);
  res.statusCode = 200;
    return res.end(JSON.stringify({ ...user_info, email: null }));
  } catch (err) {
    res.writeHead(404, {'Content-Type': 'plain/text'});
    return res.end(`${err}`)
  }
};


const makeAppointment = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  AccessTokenVerification(req, res, async (decoded: any) => {
    
 
      if (decoded.type !== 'user') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('only users can make appointmnets')
      }

      const isError = Sanitaze.sanitazeAppointment(body)
      if (isError) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error Sanitazing: ' + isError)
    }
    
      const appointment = await mongo.findActiveAppointmentByUserIDAndOrderID(decoded.id, body.order_parent_id)
      console.log('appointmentfound')
      console.log(appointment)
      if (appointment && !appointment?.confirmed) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('You have done an appointment to this order already')
      }

    
    
      // Check if the user has more than two active appointments 
    const user_appointments: any | null = await mongo.findActiveAppointmentsFromUserId(decoded.id);
    
    if (user_appointments?.length > 2) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Users can only have two active appointments')
    }
 
      const foundOrder: OutputtedOrder | null = await orderCache.getOrderById(body.order_parent_id)
      if (!foundOrder) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Order not found')
    }
    
    if (foundOrder?.over) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Order already completed')
    }

    let err;
    let zero_items_count = 0;
    for (let i = 0; i < donated.length; i++){
      if (body.items[i] > (foundOrder.items[i] - foundOrder.donated[i])) {
        err = true;
        break;
      }
      if (body.items[i] == 0) zero_items_count++
    }
    
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('the amount you are aiming to donate does not fit the missing values set by the ONG')
    }

    if (donated.length === zero_items_count) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Nenhuma quantidade foi submetida para o agendamento')
    }

      const foundOng: OutputtedOng | null = await ongCache.getOngById(foundOrder.owner.toString())
      if (!foundOng) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('ONG not found or has been deleted')
      }



    const inserted = await appointmentCache.insertAppointment(
      { ong_parent_id: foundOng._id, user_parent_id: new ObjectId(decoded.id), ...body }
    )
      if (!inserted) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Failed for unexpected error')
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok')
  })
}


const forgetPasswordValidation = async (req: IncomingMessage, res: ServerResponse, body: any) => {
  try {
    
    const stringified_code_path = body.code_path.toString()

    const isCodePathError = Sanitaze.sanitazeCodePath(stringified_code_path)
    if (isCodePathError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isCodePathError)
    }
    const isPasswordError = Sanitaze.sanitazePassword({ password: body.password })
    if (isPasswordError) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Error Sanitazing: ' + isPasswordError)
    }
    
    if (body.password !== body.confirm_password) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Senhas não coincidem, por favor, tenha certeza de que sao iguais antes de altera-las.')
    }

       
    
    const entity: any | null = await redis.getVerification(stringified_code_path);
    if (!entity) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Your code might have been expired')
    }
    const parsedEntity = JSON.parse(entity)

    if (parsedEntity?.burned) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Your code has been used already')
    }
     
    if (parsedEntity.type === 'user') {
      const updated = await mongo.updateOneUserPassword(parsedEntity.email, body.password)
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error while updating')
      }
      redis.burnCodePath(stringified_code_path);
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      return res.end()

    } else if (parsedEntity.type === 'ong') {

      const updated = await mongo.updateOneOngPassword(parsedEntity.email, body.password)
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Error while updating')
      }
      redis.burnCodePath(stringified_code_path);
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      return res.end()
      
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      return res.end('bad request')
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    return res.end('bad request')
  }
}

          
         







export const POST = {
  registerOng,
  registerUser,
  loginZeroWaste,
  
  // requestDonation,
  createOrder,
  makeAppointment,
  viewDonations,
  getOngsInfoBasedOnIdsForLikes,
  changeInfo,
  deleteAccount,
  forgetPasswordValidation
}

