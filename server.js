const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// --- SETUP FIREBASE ---
// Make sure you have your 'serviceAccountKey.json' file in this same folder!
var serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const app = express();

app.use(cors());

// Increase limit to handle generic app payloads
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve your frontend files (HTML/CSS/JS)
app.use(express.static(__dirname));

// Default route loads the shop
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// 🔥 AUTOMATED SMS LISTENER (WEBHOOK)
// ==========================================
app.post('/webhook/sms', async (req, res) => {
  console.log("\n🔔 NEW SMS RECEIVED VIA WEBHOOK 🔔");

  try {
    const payload = req.body;
    
    // Extract text from MacroDroid payload
    const messageRaw = payload.text || payload.message || JSON.stringify(payload);
    const sender = payload.sender || "Unknown";
    
    // Regex for M-Pesa Code: 10 Uppercase Letters/Numbers
    const codeRegex = /([A-Z0-9]{10})/;
    // Regex for Amount: Finds 'Ksh' followed by numbers
    const amountRegex = /Ksh\.?[\s]*([\d,]+\.?\d*)/i;
    // Regex for Phone: Finds a phone number INSIDE the message text
    const phoneRegex = /\d{10,12}/;

    const codeMatch = messageRaw.match(codeRegex);
    const amountMatch = messageRaw.match(amountRegex);
    const phoneMatch = messageRaw.match(phoneRegex);

    if (codeMatch && amountMatch) {
      const transactionId = codeMatch[1].toUpperCase();
      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      const phone = phoneMatch ? phoneMatch[0] : sender; 

      console.log(`✅ VALID PAYMENT! Saving -> Code: ${transactionId} | Amount: ${amount}`);

      // 6. SAVE TO DATABASE FIRST
      await db.collection('mpesa_payments').doc(transactionId).set({
        transactionId: transactionId,
        amount: amount,
        phone: phone,
        fullMessage: messageRaw,
        used: false,
        method: "Auto-Forwarder",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log("💾 Saved successfully to Firestore.");
      
      // 7. FINALLY, send the success response back to MacroDroid!
      // Vercel will sleep AFTER this line.
      return res.status(200).send("Message Received and Saved");

    } else {
      console.log("❌ Could not extract Code or Amount. Check Regex.");
      return res.status(400).send("Invalid M-Pesa format");
    }

  } catch (err) {
    console.error("🔥 Webhook Error:", err);
    // Send a 500 error so MacroDroid knows it actually failed
    return res.status(500).send("Internal Server Error"); 
  }
});

// CRITICAL FOR VERCEL: You MUST export the app at the very bottom of server.js
module.exports = app;

    
    // 2. SMART PARSING: Apps send the message in different fields. 
    // We check them all to find the actual text.
    let messageRaw = 
        payload.message || 
        payload.text || 
        payload.content || 
        payload.body || 
        payload.sms ||
        (payload.data ? payload.data.message : "") ||
        "";

    // 3. Sender Info (Optional, but good to have)
    let sender = 
        payload.from || 
        payload.sender || 
        payload.number || 
        payload.phone ||
        "Unknown";

    if (!messageRaw) return console.log("⚠️  Empty payload received.");

    console.log(`🔎 Inspecting: "${messageRaw.substring(0, 50)}..."`);

    // 4. SECURITY FILTER: Only process M-Pesa messages
    // We look for 'Confirmed' to avoid spam.
    if (!messageRaw.toLowerCase().includes("confirmed")) {
        return console.log("⚠️  Ignored: Not an M-Pesa confirmation message.");
    }

    // 5. EXTRACT DATA (The Magic Logic)
    // Regex for Code: Finds 10 uppercase/numbers followed by 'Confirmed'
    // Handles "Q123... Confirmed" OR "Q123...Confirmed" (no space)
    const codeRegex = /([A-Z0-9]{10})[\s\.]*Confirmed/i;
    
    // Regex for Amount: Finds 'Ksh' followed by numbers
    const amountRegex = /Ksh\.?[\s]*([\d,]+\.?\d*)/i;
    
    // Regex for Phone: Finds a phone number INSIDE the message text
    const phoneRegex = /\d{10,12}/;

    const codeMatch = messageRaw.match(codeRegex);
    const amountMatch = messageRaw.match(amountRegex);
    const phoneMatch = messageRaw.match(phoneRegex);

    if (codeMatch && amountMatch) {
      const transactionId = codeMatch[1].toUpperCase();
      // Remove commas from amount (e.g., 1,500 becomes 1500)
      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      const phone = phoneMatch ? phoneMatch[0] : sender; 

      console.log(`✅ VALID PAYMENT! Saving -> Code: ${transactionId} | Amount: ${amount}`);

      // 6. SAVE TO DATABASE
      await db.collection('mpesa_payments').doc(transactionId).set({
        transactionId: transactionId,
        amount: amount,
        phone: phone,
        fullMessage: messageRaw,
        used: false, // Start as unused
        method: "Auto-Forwarder", // So you know it came from the app
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log("💾 Saved successfully to Firestore.");
    } else {
      console.log("❌ Could not extract Code or Amount. Check Regex.");
    }

  } catch (err) {
    console.error("🔥 Webhook Error:", err);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 EggMaster Server running on port ${PORT}`));
