
require("dotenv").config(); 
const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const cron = require("node-cron");
const bcrypt = require("bcrypt");
const path = require("path");
const twilio = require("twilio");

const app = express();


app.use(
  cors({
    origin: ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5000"],
    credentials: false,
  })
);
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); 

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/frontend", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "frontend.html"));
});
app.get("/frontend.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "frontend.html"));
});

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "akriti0104",
  database: "food_expiry_db",
});
db.connect((err) => {
  if (err) console.error("❌ MySQL connection failed:", err);
  else console.log("✅ MySQL connected successfully.");
});

const PHONE_REGEX = /^\+\d{1,3}\d{10}$/; 
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/; 

function isValidDateString(s) {
  const d = new Date(s);
  return !isNaN(d.getTime());
}
function ymd(s) {
  return new Date(s).toISOString().split("T")[0]; 
}


function timeLeft(expiryDate) {
  const now = new Date();
  const exp = new Date(expiryDate);
  const ms = exp - now;
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `in ${days} day${days > 1 ? "s" : ""}`;
  return `in ${hours} hour${hours !== 1 ? "s" : ""}`;
}


function buildAlertText(items, userName = "") {
  const lines = items.map((i) => {
    const left = timeLeft(i.expiry_date);
    const cat = i.category ? ` (${i.category})` : "";
    const prettyDate = new Date(i.expiry_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `• ${i.item_name}${cat} — ${prettyDate} (${left})`;
  });
  const header = userName ? `Hi ${userName}, ` : "";
  return `⚠ Food Alert!\n${header}these item(s) will expire soon:\n\n${lines.join(
    "\n"
  )}\n\nPlease check your inventory.`;
}

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,     
  TWILIO_WA_TEMPLATE_SID,   
  TWILIO_SMS_FROM,          
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
  console.warn("⚠️  Twilio env vars missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in .env");
}
const twilioClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

async function sendWhatsAppFreeform(phone, body) {
  if (!twilioClient) throw new Error("Twilio client not initialized.");
  return twilioClient.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${phone}`,
    body,
  });
}

async function sendWhatsAppTemplate(phone, vars = { "1": "", "2": "" }) {
  if (!twilioClient) throw new Error("Twilio client not initialized.");
  if (!TWILIO_WA_TEMPLATE_SID) throw new Error("No WhatsApp template SID configured.");
  return twilioClient.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${phone}`,
    contentSid: TWILIO_WA_TEMPLATE_SID,
    contentVariables: JSON.stringify(vars),
  });
}

async function sendSmsFallback(phone, body) {
  if (!twilioClient) throw new Error("Twilio client not initialized.");
  if (!TWILIO_SMS_FROM) throw new Error("No SMS FROM number configured.");
  return twilioClient.messages.create({
    from: TWILIO_SMS_FROM,
    to: phone,
    body,
  });
}


async function sendExpiryAlert(phone, textForUser, templateVarsIfNeeded) {
  if (!twilioClient) {
    console.warn("⚠️  Twilio client not initialized; alert skipped.");
    return;
  }

  
  try {
    const m = await sendWhatsAppFreeform(phone, textForUser);
    console.log(`✅ WA free-form sent to ${phone}. SID: ${m.sid}`);
    return;
  } catch (e) {
    console.warn(`WA free-form failed for ${phone}: ${e.message}`);
  }

  
  try {
    const m = await sendWhatsAppTemplate(phone, templateVarsIfNeeded);
    console.log(`✅ WA template sent to ${phone}. SID: ${m.sid}`);
    return;
  } catch (e) {
    console.warn(`WA template failed for ${phone}: ${e.message}`);
  }

  try {
    const m = await sendSmsFallback(phone, textForUser);
    console.log(`✅ SMS fallback sent to ${phone}. SID: ${m.sid}`);
  } catch (e) {
    console.error(`❌ All alert channels failed for ${phone}: ${e.message}`);
  }
}


app.post("/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }
    if (!PHONE_REGEX.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone format. Example: +911234567890",
      });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters and include 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (name, phone, password) VALUES (?, ?, ?)";
    db.query(sql, [name.trim(), phone.trim(), hashedPassword], (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.json({ success: false, message: "📱 Phone number already registered!" });
        }
        console.error("❌ Database error:", err);
        return res.status(500).json({ success: false, message: "Database error." });
      }
      res.json({ success: true, message: "✅ Registration successful!" });
    });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post("/login", (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: "Phone and password are required." });
  }
  if (!PHONE_REGEX.test(phone)) {
    return res.status(400).json({ success: false, message: "Invalid phone format." });
  }

  db.query("SELECT * FROM users WHERE phone = ?", [phone.trim()], async (err, result) => {
    if (err) {
      console.error("❌ Database error during login:", err);
      return res.status(500).json({ success: false, message: "Database error." });
    }
    if (result.length === 0) return res.json({ success: false, message: "User not found." });

    const user = result[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: "Incorrect password." });

    res.json({
      success: true,
      message: "✅ Login successful!",
      user_id: user.id,
      name: user.name,
      redirect_url: "/frontend",
    });
  });
});


app.post("/add-item", (req, res) => {
  let { item_name, quantity, purchase_date, expiry_date, category, user_id } = req.body;
  if (!item_name || !quantity || !purchase_date || !expiry_date || !user_id) {
    return res.status(400).json({ success: false, message: "All fields except category are required." });
  }

  quantity = parseInt(quantity, 10);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: "Quantity must be a positive integer." });
  }

  if (!isValidDateString(purchase_date) || !isValidDateString(expiry_date)) {
    return res.status(400).json({ success: false, message: "Invalid date(s) provided." });
  }

  purchase_date = ymd(purchase_date);
  expiry_date = ymd(expiry_date);

  if (new Date(expiry_date) < new Date(purchase_date)) {
    return res.status(400).json({ success: false, message: "Expiry date cannot be before purchase date." });
  }

  const sql = `
    INSERT INTO food_items (item_name, quantity, purchase_date, expiry_date, category, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.query(
    sql,
    [item_name.trim(), quantity, purchase_date, expiry_date, (category || "").trim(), user_id],
    (err) => {
      if (err) {
        console.error("❌ Error adding item:", err);
        return res.status(500).json({ success: false, message: "Database error." });
      }
      res.json({ success: true, message: "✅ Item added successfully!" });
    }
  );
});

app.get("/items/:user_id", (req, res) => {
  const { user_id } = req.params;
  db.query(
    "SELECT * FROM food_items WHERE user_id = ? ORDER BY expiry_date ASC",
    [user_id],
    (err, result) => {
      if (err) {
        console.error("❌ Error fetching items:", err);
        return res.status(500).json({ success: false, message: "Database error." });
      }
      res.json({ success: true, items: result });
    }
  );
});

app.delete("/items/:id", (req, res) => {
  const idRaw = req.params.id;
  const id = parseInt(idRaw, 10);

  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: `Invalid item id: ${idRaw}` });
  }

  db.query("DELETE FROM food_items WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("❌ Error deleting item:", err);
      return res.status(500).json({ success: false, message: "Database error." });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Item not found." });
    }
    res.json({ success: true, message: "🗑️ Item deleted successfully!", affectedRows: result.affectedRows });
  });
});


app.get("/notify/user/:user_id", (req, res) => {
  const user_id = parseInt(req.params.user_id, 10);
  if (!user_id) return res.status(400).send("Missing user_id");

  const qUser = "SELECT id, name, phone FROM users WHERE id = ?";
  db.query(qUser, [user_id], (err, users) => {
    if (err) return res.status(500).send("DB error (user)");
    if (!users || users.length === 0) return res.status(404).send("User not found");

    const user = users[0];
    if (!user.phone || !PHONE_REGEX.test(user.phone)) {
      return res.status(400).send("User phone is missing or invalid format.");
    }

    const qItems = `
      SELECT item_name, category, expiry_date
      FROM food_items
      WHERE user_id = ?
        AND expiry_date >= CURDATE()
        AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)
      ORDER BY expiry_date ASC
    `;
    db.query(qItems, [user_id], async (err2, items) => {
      if (err2) return res.status(500).send("DB error (items)");
      if (!items || items.length === 0) {
        return res.send("No expiring-soon items for this user.");
      }

      const text = buildAlertText(items, user.name);
      const now = new Date();
      const templateVars = {
        "1": now.toLocaleDateString("en-IN"),
        "2": now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
      };

      try {
        await sendExpiryAlert(user.phone, text, templateVars);
        res.send("Alert sent (WA free-form or template, SMS fallback if configured).");
      } catch (e) {
        res.status(500).send("Failed to send alert: " + e.message);
      }
    });
  });
});

cron.schedule("51 15 * * *", () => {
  console.log("🕒 Checking for items expiring soon (≤2 days) and sending alerts...");

  const query = `
    SELECT 
      fi.item_name,
      fi.category,
      fi.expiry_date,
      u.name AS user_name,
      u.phone,
      u.id AS user_id
    FROM food_items fi
    JOIN users u ON fi.user_id = u.id
    WHERE fi.expiry_date >= CURDATE()
      AND fi.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)
    ORDER BY u.id, fi.expiry_date
  `;

  db.query(query, async (err, results) => {
    if (err) {
      console.error("❌ CRON DB Error:", err);
      return;
    }
    if (!results || results.length === 0) {
      console.log("✅ No items expiring within the next 2 days.");
      return;
    }

    
    const grouped = results.reduce((acc, row) => {
      if (!acc[row.user_id]) {
        acc[row.user_id] = { phone: row.phone, name: row.user_name, items: [] };
      }
      acc[row.user_id].items.push({
        item_name: row.item_name,
        category: row.category,
        expiry_date: row.expiry_date,
      });
      return acc;
    }, {});

    for (const [uid, payload] of Object.entries(grouped)) {
      const { phone, name, items } = payload;
      if (!phone || !PHONE_REGEX.test(phone)) {
        console.warn(`Skipping invalid phone for user ${uid}: ${phone}`);
        continue;
      }
      const text = buildAlertText(items, name);
      const now = new Date();
      const templateVars = {
        "1": now.toLocaleDateString("en-IN"),
        "2": now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
      };
      console.log(`📣 Sending 'expiring soon' alert for User ${uid} (${phone}) for ${items.length} item(s).`);
      await sendExpiryAlert(phone, text, templateVars);
    }
  });
});

cron.schedule(
  "50 15 * * *",
  async () => {
    console.log("🕒 Running daily 'expiring TODAY' job at 15:13 (IST).");

    db.query("SELECT id, name, phone FROM users", async (errUsers, users) => {
      if (errUsers) {
        console.error("❌ Error fetching users for daily-today job:", errUsers);
        return;
      }
      if (!users || users.length === 0) {
        console.log("ℹ️ No users found for daily-today job.");
        return;
      }

      for (const user of users) {
        try {
        
          if (!user.phone || !PHONE_REGEX.test(user.phone)) {
            console.warn(`Skipping user ${user.id} - invalid/missing phone: ${user.phone}`);
            continue;
          }

          const qItemsToday = `
            SELECT item_name, category, expiry_date
            FROM food_items
            WHERE user_id = ?
              AND expiry_date = CURDATE()
            ORDER BY expiry_date ASC
          `;

          const itemsToday = await new Promise((resolve, reject) => {
            db.query(qItemsToday, [user.id], (errItems, rows) => {
              if (errItems) return reject(errItems);
              resolve(rows || []);
            });
          });

          const now = new Date();
          const templateVars = {
            "1": now.toLocaleDateString("en-IN"),
            "2": now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
          };

          if (!itemsToday || itemsToday.length === 0) {
            const noneBody = `⚠ Food Alert!\nHi ${user.name || ""} — No food is expiring today. ✅`;
            console.log(`(Daily-15:13) sending "none expiring" to ${user.phone}`);
            await sendExpiryAlert(user.phone, noneBody, templateVars);
            continue;
          }

          const text = buildAlertText(itemsToday, user.name || "");
          console.log(`(Daily-15:13) sending TODAY-expiring alert to ${user.phone} for ${itemsToday.length} item(s).`);
          await sendExpiryAlert(user.phone, text, templateVars);
        } catch (e) {
          console.error(`❌ Error for user ${user.id} in daily-today job:`, e.message || e);
        }
      } 
    }); 
  },
  {
    timezone: "Asia/Kolkata",
  }
);


app.get("/test-wa", async (req, res) => {
  try {
    const text = buildAlertText(
      [
        { item_name: "Milk", category: "dairy", expiry_date: new Date() },
        { item_name: "Yogurt", category: "dairy", expiry_date: new Date() },
      ],
      "Akriti"
    );
    const now = new Date();
    const templateVars = {
      "1": now.toLocaleDateString("en-IN"),
      "2": now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
    };
    await sendExpiryAlert("+919528853109", text, templateVars);
    res.send("✅ Test alert attempted (WA free-form → WA template → SMS). Check your phone and logs.");
  } catch (e) {
    res.status(500).send("❌ Test failed: " + e.message);
  }
});

const PORT = 5000;
app.listen(PORT, () =>
  console.log(
    `🚀 Server running on http://localhost:${PORT}/ (login)  |  http://localhost:${PORT}/frontend (dashboard)`
  )
);
