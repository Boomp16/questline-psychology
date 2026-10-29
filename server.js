import express from 'express';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json({limit:'64kb'}));
app.use((req,res,next)=>{res.set('Content-Type', 'text/html; charset=utf-8');next()});
app.use(express.static('.'));

app.post('/api/reminders/test', async (req, res) => {
  const {email, subject='Questline reminder', text='Ada quest yang menunggu. Selesaikan satu bagian kecil hari ini.'} = req.body || {};
  if (!email) return res.status(400).json({error:'Email wajib diisi.'});
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(503).json({error:'SMTP belum dikonfigurasi. Tambahkan SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, dan MAIL_FROM.'});
  }
  try {
    const transporter = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
    await transporter.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:email,subject,text});
    res.json({ok:true});
  } catch (error) { res.status(502).json({error:'Email gagal dikirim.', detail:error.message}); }
});

app.get('/api/health', (_req,res)=>res.json({ok:true,service:'questline'}));
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`Questline server listening on ${port}`));
