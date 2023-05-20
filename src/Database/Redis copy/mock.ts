import { ObjectId } from 'mongodb';
import { createClient } from 'redis';



export class RedisMock {
    private client: any;
    private data: any[];
    private favorites: any[];
    private likes: any[];

    constructor() {
        this.start()
        this.data = []
        this.favorites = []
        this.likes = []
    }
    
    public async start() {
        console.log('Using Redis Mock')
    }

    async storeVerification(code_path: string, entity: any): Promise<any | null> {
        try {
            this.data.push({ key: code_path, value: entity });
            console.log(this.data)
            return true;
        } catch (err) {
            return null;
        }
    }

    async storeTokenAsCache(token: string, token_info: string) {
        try {
            this.data.push({ key: token, value: token_info });
            return true;
        } catch (err) {
            return null;
        }
    }

    async getTokenAsCache(token: string) {
        try {
            const found_token = this.data.find((item) => { return item.key === token })
            if (found_token) return found_token.value
            return null;
        } catch (err) {
            return null;
        }
    }

    async storeFavorite(user: any, order: any) {
        try {
            // this.favorites.push({ key: `user:${user}:likes:`, value: order })
            order = {
                _id: order._id,
                name: order.name
            }
            this.favorites.push({ key: `user:${user}:likes:`, value: order })
            console.log('stored favorites' + JSON.stringify(this.favorites))
            return true;
        } catch (err) {
            return null;
        }
    }
    async deleteFavorite(user: any, order: any) {
        try {
            
            console.log('\n \n user ' + user)
            console.log('\n \n orderid ' + order._id)
            
            // console.log('deleted favorites ' + this.favorites[0].value._id)
            // this.favorites = this.favorites.filter((item) => !(item.key === `user:${user}:likes:` && item.value._id === order._id))
            // this.favorites = this.favorites.filter((item) =>  item.value._id.toString() != order._id.toString() )
            this.favorites = this.favorites.filter((item) => {
                console.log('----------------------')
                console.log(item.value._id.toString())
                console.log(order._id.toString())
                console.log('----------------------')
                return item.value._id.toString() != order._id.toString()
            })
            console.log('\n \n favorites ' + JSON.stringify(this.favorites))
            return true;
        } catch (err) {
            return null;
        }
    }
    async findFavorite(user: any, order: any) {
        try {
            console.log('order' + JSON.stringify(order))
            // const fav_found = this.favorites.find((item) => (item.key == `user:${user}:likes:` && item.value._id == order._id) )
            const fav_found = this.favorites.find((item) => (item.key == `user:${user}:likes:` && item.value._id == order._id))
            console.log('\n \n \n found ' + fav_found)
            if (fav_found) return true;
            return null;
        } catch (err) {
            return null;
        }
    }

    async getFavorites(user_id: any) {
        try {
            const fav_founds = this.favorites.filter(item => item.key === `user:${user_id}:likes:`);
            return fav_founds
        } catch (err) {
            return [];
        }
    }

    async storeGoogleSession(access_token: string, data: any): Promise<any | null> {
        try {
            this.data.push({ key: access_token, value: data })
            return true;
        } catch (err) {
            return null;
        }
    }

    async deleteVerification(key: string): Promise<any | null> {
        try {
            this.data = this.data.filter((item) => { return item.key !== key })
            return true;
        } catch (err) {
            return null;
        }
    }

    async getVerification(code_path: string): Promise<any | null> {
        try {
            const code_user = this.data.find((item) => { return item.key === code_path })
            console.log(code_user)
            if (code_user) return code_user.value
            return null;
        } catch (err) {
            return null;
        }
    }

    async getGoogleSession(access_token: string): Promise<any | null> {
        try {
            const token = this.data.find((item) => { item.key === access_token })
            if (token) return token;
            return null;
        } catch (err) {
            return null;
        }
    }

    async storeLikeIfNotFound(user_id: string, order_id: string) {
        const like = {
            user_id,
            order_id,
        }
        const foundLike = this.likes.find(l => (l.user_id === like.user_id && l.order_id === order_id))
        if (!foundLike) {
            this.likes.push(like);
        }
    }
    async deleteLikeIfFound(user_id: string, order_id: string) {
        const like = {
            user_id,
            order_id,
        }
        this.likes = this.likes.filter(l => (l.user_id !== user_id && l.order_id !== order_id));
        
    }
    async getLikesOfMultipleOrders(orders: any[]) { //FROM ORDER ID
        try {
            const orderLikes = orders.reduce((acc, order) => {
                const id = order._id.toString();
                const count = this.likes.filter((like) => like.order_id.toString() === id).length;
                acc[id] = count;
                return acc;
              }, {});
              console.log(orderLikes);
              return orderLikes;

        } catch (err) {
            return [];
        }
    }
    async getMyLikes(user_id: any[]) { //FROM ORDER ID
        try {
            const my_likes = this.likes.filter(l => {return l.user_id === user_id})
            return my_likes;
        } catch (err) {
            return [];
        }
    }

    // async querySession(sessionId) {
    //     return await this.client.get(sessionId);
    // }

    // async storeMessage({ id, from, to, text}) {
    //     return await this.client.set(id,  JSON.stringify({ from, to, text }));
    // }


}



