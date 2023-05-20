
import { MongoClient, Collection, ObjectId } from 'mongodb';
import { threadId } from 'node:worker_threads';
import { OutputtedAppointment, BodyAppointment, OutputtedOrder, BodyOrder, OutputtedOng } from '../../Cache';

export class Mongo {
  private client: any;
  private db: any;
  private user_collection?: Collection;
  private ong_collection?: Collection;
  private order_collection?: Collection;
  private donation_collection?: Collection;
  private appointment_collection?: Collection;
  private TTL: number = 15 * 60 // 15 min
  private pack_size: number = 10;
  private ong_public_projection: {} = {
    address: 1,
    created_at: 1,
    name: 1,
    phone: 1,
  }
  
    constructor(
    ) {
      try {
        (async() => { 
          await this.start()
          console.log('Connected to Mongo')
        })()

        } catch (err) {
            console.log('MongoError: ' + err)
        }
  }
  

    async start(): Promise<void> {
      this.client = await MongoClient.connect(`${process.env.MONGODB_URI}`, {
      
        
      });
      this.db = this.client.db(process.env.MONGODB_DBNAME);
      this.user_collection = await this.db.collection(process.env.MONGODB_USER_COLLECTION);
      this.ong_collection = await this.db.collection(process.env.MONGODB_ONG_COLLECTION);
      this.order_collection = await this.db.collection(process.env.MONGODB_ORDER_COLLECTION);
      this.donation_collection = await this.db.collection(process.env.MONGODB_DONATION_COLLECTION);
      this.appointment_collection = await this.db.collection(process.env.MONGODB_APPOINTMENT_COLLECTION);
  }
  
  // USER
  async insertOneUser(data_object: any): Promise<ObjectId | null> {
    try {
      const res = await this.user_collection?.insertOne(data_object);
      if (!res) return null;
      console.log(`Inserted document in Mongo ${res?.insertedId}`);
      return res.insertedId;
    } catch (err) {
      console.log('Error inserting document:', err);
      return null;
    }
}
 



async findOneUser(data_object: any): Promise<any | null> {
    try {
       return await this.user_collection?.findOne(data_object);
    //   console.log(`Inserted document with _id: ${result.insertedId}`);
    } catch (err) {
      console.log('Error finding document:', err);
    }
}


  // ONG
  async insertOneOng(data_object: any): Promise<ObjectId | null> {
        try {
          const res = await this.ong_collection?.insertOne(data_object);
          if (!res) return null;
          console.log(`Inserted document in Mongo ${res?.insertedId}`);
          return res.insertedId;
        } catch (err) {
          console.log('Error inserting document:', err);
          return null;
        }
    }

  

  async findOneOngById(id: string): Promise<OutputtedOng | null> {
    try {
      return await this.ong_collection?.findOne({ _id: new ObjectId(id) }) as OutputtedOng;
    } catch (err) {
      console.log(err)
      return null;
    }
}

  async findOnePublicOng(data_object: any): Promise<any | null> {
    try {

      return await this.ong_collection?.findOne(data_object, { projection: this.ong_public_projection });
    //   console.log(`Inserted document with _id: ${result.insertedId}`);
    } catch (err) {
      console.log('Error finding document:', err);
    }
}

  // used to verify if user or ong exists during registering process
async findOneOngOrUserWhereOR(data_object: any): Promise<any | null> {
    console.log(data_object)
    const session = await this.client.startSession()
    try {
      await session.startTransaction();
      
      const found = await this.ong_collection?.findOne({
        $or: [
          { email: data_object.email },
          // { phone: data_object.phone },
          // { cnpj: data_object.cnpj }
        ]
      });
      if (found) {
        await session.commitTransaction();
        await session.endSession();
        return found;
      } else {
        const found = await this.user_collection?.findOne({ $or: [{ email: data_object.email }, { phone: data_object.phone }] });
        await session.commitTransaction();
        await session.endSession();
        if (found) {
          return found;
        } else {
          return false
        }
      }
    //   console.log(`Inserted document with _id: ${result.insertedId}`);
    } catch (err) {
      await session.abortTransaction();
      console.log('Error finding document:', err);
    }
}




  // ORDER
  async findOneOrderById(id: string): Promise<OutputtedOrder | null> {
    try {
      return await this.order_collection?.findOne({ _id: new ObjectId(id) }) as OutputtedOrder;
    } catch (err) {
      console.log(err)
      return null;
    }
  }

  async findOneOrderWithOngTime(_id: string): Promise<any | null> {
    try {
      const query = [
        {
          $match: {
            _id: new ObjectId(_id)
          }
        },
        {
          $lookup: {
            from: 'ong',
            localField: 'owner',
            foreignField: '_id',
            as: 'ong'
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            items: 1,
            donated: 1,
            expires_in: 1,
            owner: 1,
            // field1: 1,
            // field2: 1,
            'ong._id': 1,
            'ong.name': 1,
            'ong.working_time': 1
          }
        }
      ]
      const docs = await this.order_collection?.aggregate(query).toArray();
      if (!docs || docs.length === 0) {
        return null;
      }
      return docs;


    //   console.log(`Inserted document with _id: ${result.insertedId}`);
    } catch (err) {
      console.log('Error finding document:', err);
    }
  }
  
  async findAllCompanyOrders(data_object: any) { // max five
    try {
      // const query = [
      //   { $where: data_object }
      // ];
      const docs = await this.order_collection?.find(data_object).toArray()

      // const docs = await this.order_collection?.aggregate(query).toArray()
      if (!docs || docs?.length === 0) return {};
      return docs;
    } catch (err) {
      console.log('Error findind all company orders document:', err);
      return null;
    }
  }
  // max of five per company
  
  async insertOneOrder(order: BodyOrder): Promise<ObjectId | null> {
    try {
      console.log(order)
      const res: any = await this.order_collection?.insertOne(order);
      return res.insertedId;
    } catch (err) {
      console.log('Error inserting document:', err);
      return null;
    }
  }

  async insertOneDonation2(donation: any): Promise<boolean | null> {
    try {
     
      const session = await this.client.startSession()
      await session.startTransaction();

      const query = { _id: new ObjectId(`${donation.order_parent_id}`) }
      // const update = { $inc: { donated: donation.value } }
      const update = {
        $inc: {
          // donated: {
            "donated.brinquedo": donation.items.brinquedo || 0,
            "donated.conserva": donation.items.conserva || 0,
            "donated.dinheiro": donation.items.dinheiro || 0,
            "donated.leite": donation.items.leite || 0,
            "donated.livro": donation.items.livro || 0,
            "donated.oleo": donation.items.oleo || 0,
            "donated.racao": donation.items.racao || 0
          // }
        }
      };

     

      try {
    
        await this.order_collection?.updateOne(query, update);
        await this.donation_collection?.insertOne(donation);
        await this.user_collection?.updateOne({ email: donation.email }, { $inc: { xp: 10 } });

        await session.commitTransaction();
        await session.endSession()
        return true;
      } catch (err) {
        await session.abortTransaction();
        console.log('Transaction aborted:' + err);
        return null;
      }
    } catch (err) {
      return null;
    }
   }


  async insertOneDonation(donation: any): Promise<boolean | null> {
    try {
      //max nao pode ser maior que expectation
      const session = await this.client.startSession()
      await session.startTransaction();

      const query = { _id: new ObjectId(`${donation.order_parent_id}`) }
      const update = { $inc: { donated: donation.value } }

      try {
        // const res1 = await this.order_collection?.findOne(query, update);
        // const res1 = await this.order_collection?.updateOne(query, update);
        const res2 = await this.donation_collection?.insertOne(donation);
        await session.commitTransaction();
        await session.endSession()
        return true;
      } catch (err) {
        await session.abortTransaction();
        console.log('Transaction aborted');
        return null;
      }
    } catch (err) {
      return null;
    }
  }
  

  // GET FIVE
  async retrieveFiveItems(pack: number): Promise<any[] | null> {
    try {
      // const docs = await this.order_collection?.find({}).skip(skip).limit(batchSize).toArray();
      const query = [
        { $skip: (pack - 1) * this.pack_size },
        { $limit: this.pack_size },
        { $lookup: {
          from: "user",
          localField: "company_id",
          foreignField: "_id",
          as: "user"
        }
        },
        {
          $addFields: {
            user_name: { $arrayElemAt: ["$user.name", 0] }
          }
        },
        {
          $project: {
            items: 0,
            // user_name: { $arrayElemAt: ["$user.name", 0] }
            user: 0
          }
        }, // exclude _id field from the result
        // { $sort: { field_name: 1 } } // sort by a specific field
      ];
      const docs = await this.order_collection?.aggregate(query).toArray()
      if (!docs || docs?.length === 0) return null;
      return docs;
    } catch (err) {
      console.log('Error getting five documents:', err);
      return null;
     }
  }

  async retrieveFiveItems2(pack: number): Promise<any[] | null> {
    try {
      // const docs = await this.order_collection?.find({}).skip(skip).limit(batchSize).toArray();
      const query = [
        { $skip: (pack - 1) * this.pack_size },
        { $limit: this.pack_size },
        { $lookup: {
          from: "ong",
          localField: "owner",
          foreignField: "_id",
          as: "ong"
        }
        },
        { $addFields: { } },
        {
          $project: {
            items: 1,
            donated: 1,
            name: 1,
            description: 1,
            expires_in: 1,
            owner: 1,
            ong_name: "$ong.name"
          
          }
        }
      ];
      const docs = await this.order_collection?.aggregate(query).toArray()
      console.log(docs)
      console.log(docs?.length)
      if (!docs || docs?.length === 0) return null;
      return docs;
    } catch (err) {
      console.log('Error getting five documents:', err);
      return null;
     }
  }

  async retrieveFiveOngs(pack: number): Promise<any[] | null> {
    try {
      // const docs = await this.order_collection?.find({}).skip(skip).limit(batchSize).toArray();
      const query = [
        { $skip: (pack - 1) * this.pack_size },
        { $limit: this.pack_size },
        // { $lookup: {
        //   from: "ong",
        //   localField: "owner",
        //   foreignField: "_id",
        //   as: "ong"
        // }},
        { $addFields: { } },
        // {
        //   $project: {
        //     items: 1,
        //     donated: 1,
        //     name: 1,
        //     expires_in: 1,
        //     owner: 1,
        //     ong_name: "$ong.name"
        //   }
        // }
      ];
      const docs = await this.ong_collection?.aggregate(query).toArray()
      console.log(docs)
      console.log(docs?.length)
      if (!docs || docs?.length === 0) return null;
      return docs;
    } catch (err) {
      console.log('Error getting five documents:', err);
      return null;
     }
  }

  async retrieveUsersWhoDonatedToSpecificOrder(order_id: string): Promise<any[] | null> {
    try {
     
      const pipeline = [
        {
          $match: {
            order_parent_id: new ObjectId(order_id),
            email: { $exists: true },
          },
        },
        {
          $lookup: {
            from: "user",
            localField: "email",
            foreignField: "email",
            as: "user_info",
          },
        },
        {
          $unwind: "$user_info",
        },
        {
          $project: {
            "user_info.name": 1,
            "user_info._id": 1,
            "user_info.image": 1,
            items: 1
          },
        },
        // {
        //   $skip: (page - 1) * PAGE_SIZE
        // },
        // {
        //   $limit: PAGE_SIZE
        // }
      ];
      
      const docs = await this.donation_collection?.aggregate(pipeline).toArray()
      if (!docs || docs?.length === 0) return null;
      return docs;
    } catch (err) {
      console.log('Error getting five documents:', err);
      return null;
     }
  }

  
  async clearOrders() {
    try {
      await this.order_collection?.deleteMany({})
      console.log('Mongo order cleared')
    } catch (err) {
      console.log('Error clearing Mongo:' + err)
    }
  }

  async clearDonations() {
    try {
      await this.donation_collection?.deleteMany({})
      console.log('Mongo donation cleared')
    } catch (err) {
      console.log('Error clearing Mongo:' + err)
    }
  }

  async clearAppointments() {
    try {
      await this.appointment_collection?.deleteMany({})
      console.log('Mongo appointments cleared')
    } catch (err) {
      console.log('Error clearing Mongo:' + err)
    }
  }

  async clearAll() {
    try {
      await this.donation_collection?.deleteMany({})
      await this.order_collection?.deleteMany({})
      await this.user_collection?.deleteMany({})
      await this.ong_collection?.deleteMany({})
      await this.appointment_collection?.deleteMany({})
      console.log('Mongo cleared')
    } catch (err) {
      console.log('Error clearing Mongo:' + err)
    }
  }


  








  // APPOINTMENT








  async deleteAppointment(data_object: any): Promise<boolean> {
    try {
      await this.appointment_collection?.deleteOne(data_object);
      return true
    } catch (err) {
      console.log('Error deleting document:', err);
      return false;
    }
}
  async deleteAppointmentById(id: string): Promise<boolean> {
    try {
      await this.appointment_collection?.deleteOne({id: new ObjectId(id)});
      return true
    } catch (err) {
      console.log('Error deleting document:', err);
      return false;
    }
  }
  
  async insertAppointment(appointment: BodyAppointment): Promise<ObjectId | null> {
    try {
      const res: any = await this.appointment_collection?.insertOne({
        ong_parent_id: new ObjectId(appointment.ong_parent_id),
        order_parent_id: new ObjectId(appointment.order_parent_id),
        user_parent_id: new ObjectId(appointment.user_parent_id),
        confirmed: false,
        day: appointment.day,
        time: appointment.time,
        items: appointment.items
      });
      return res.insertedId;
    } catch (err) {
      return null
    }
  }
  
  async updateOrderBasedOnAppointmentConfirmation(appointment_id: string, appointment_items: number[], ong_id: string, order_parent_id: string): Promise<boolean | null> { 

    try {
      //max nao pode ser maior que expectation
      const session = await this.client.startSession()
      await session.startTransaction();

      const appointmentQuery = { _id: new ObjectId(appointment_id), ong_parent_id: new ObjectId(ong_id) }
      const appointmentUpdate = { $set: { confirmed: true } }

      const updateWhereOrder = { _id: new ObjectId(order_parent_id) }
      const setOrder = {
        $set: {
          donated: {
            $map: {
              input: { $zip: { inputs: ["$donated", appointment_items], useLongestLength: true } },
              in: { $add: [{ $ifNull: [{ $arrayElemAt: ["$$this", 0] }, 0] }, { $ifNull: [{ $arrayElemAt: ["$$this", 1] }, 0] }] }
            }
          }
        }
      }

      try {
        // set appointment to confirmed: true
        await this.appointment_collection?.updateOne(appointmentQuery, appointmentUpdate);

        // update order donated values
        await this.order_collection?.updateOne(
          updateWhereOrder,
          [ setOrder ]
        );
        
        // increase user level;

        await session.commitTransaction();
        await session.endSession()
        return true;
      } catch (err) {
        await session.abortTransaction();
        console.log('Transaction aborted');
        console.log(err)
        return null;
      }
    } catch (err) {
      return null;
    }
  }
  
  
async findAppointmentByUserIDAndOrderID(user_parent_id: string, order_parent_id: string): Promise<OutputtedAppointment | null> {
    try {
      return await this.appointment_collection?.findOne({
        user_parent_id: new ObjectId(user_parent_id),
        order_parent_id: new ObjectId(order_parent_id),
      }) as OutputtedAppointment;
    } catch (err) {
      console.log('Error inserting document:', err);
      return null;
    }
}

// async findOneAppointmentById(id: string): Promise<OutputtedAppointment | null> {
  async findOneAppointmentById(id: string): Promise<OutputtedAppointment | null> {
    try {
      return await this.appointment_collection?.findOne({_id: new ObjectId(id)}) as OutputtedAppointment;   
    } catch (err) {
      console.log(err)
      return null;
    }
}

  // APPOINTMENT
}

