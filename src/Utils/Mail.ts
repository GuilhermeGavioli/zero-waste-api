import sgMail from '@sendgrid/mail'

sgMail.setApiKey(`${process.env.SENDGRID_API_KEY}`)

export interface Mail{
    to: string,
    link: string,
}
export async function sendMail(mail: Mail): Promise<boolean>{
    return new Promise((resolve, reject) => {
        try {
            
            const msg = {
                to: mail.to, // Change to your recipient
                from: `${process.env.SENDGRID_FROM}`, // Change to your verified sender
                subject: 'ZERO-WASTE - Confirmation',
                text: `Clique para confirmar sua Conta: ${process.env.MAIL_ROUTE}${mail.link}`,
            }
            sgMail
            .send(msg)
            .then(() => {
                resolve(true)
            })
            .catch((error) => {
                reject(false)
            })
        } catch (err) {
            console.log(err)
            reject(false)
        }

    })
}
export async function sendForgetPasswordMail(mail: Mail): Promise<boolean>{
    return new Promise((resolve, reject) => {
        try {
            
            const msg = {
                to: mail.to, // Change to your recipient
                from: `${process.env.SENDGRID_FROM}`, // Change to your verified sender
                subject: 'ZERO-WASTE - Confirmation',
                text: `Clique aqui para mudar sua senha: ${process.env.MAIL_FORGETPASSWORD_ROUTE}${mail.link}`,
            }
            sgMail
            .send(msg)
            .then(() => {
                resolve(true)
            })
            .catch((error) => {
                reject(false)
            })
        } catch (err) {
            console.log(err)
            reject(false)
        }

    })
}