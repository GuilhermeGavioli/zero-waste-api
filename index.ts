import { IncomingMessage, ServerResponse, createServer  } from 'node:http'


createServer((req: IncomingMessage, res: ServerResponse) => { 
    res.end('ok')
}).listen(3000)