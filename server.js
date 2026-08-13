import express from "express";
import http from "http";
import { Server } from "socket.io";
import {
  TikTokLiveClient,
  EventType,
  GiftStreakTracker,
  LikeAccumulator
} from "piratetok-live-js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || "lxkt16";

let tiktokConnected = false;
let tiktokClient = null;

let giftStreakTracker = new GiftStreakTracker();
let likeAccumulator = new LikeAccumulator();

// We only turn each completed 100 likes into one 0.2-power girl hit.
let likeRemainder = 0;

const processedMessageIds = new Map();
const MESSAGE_MEMORY_MS = 60 * 1000;

app.get("/", (req, res) => {
  res.send("TikTok Mortal Kombat server is running!");
});

app.get("/status", (req, res) => {
  res.json({
    running: true,
    tiktokUsername: TIKTOK_USERNAME,
    clients: io.engine.clientsCount,
    tiktokConnected,
    rules: {
      winTarget: 100,
      normalGiftPower: 5,
      bigGiftPower: 50,
      followPower: 0.2,
      likesPerPowerUnit: 100,
      likesPower: 0.2
    }
  });
});

io.on("connection", (socket) => {
  console.log("Mortal Kombat page connected:", socket.id);

  socket.emit("serverStatus", {
    connected: true,
    tiktokUsername: TIKTOK_USERNAME
  });

  socket.emit("tiktokStatus", {
    connected: tiktokConnected
  });

  socket.on("disconnect", () => {
    console.log("Mortal Kombat page disconnected:", socket.id);
  });
});

function sendGameCommand(command) {
  console.log("🎮 GAME COMMAND:", JSON.stringify(command));
  io.emit("gameCommand", command);
}

function cleanupTracking() {
  const now = Date.now();

  for (const [id, timestamp] of processedMessageIds) {
    if (now - timestamp > MESSAGE_MEMORY_MS) {
      processedMessageIds.delete(id);
    }
  }
}

setInterval(cleanupTracking, 10 * 1000);

function getMessageId(data) {
  return String(
    data?.common?.msgId ||
    data?.msgId ||
    data?.eventId ||
    ""
  );
}

function isDuplicateMessage(data) {
  const messageId = getMessageId(data);

  if (!messageId) return false;

  if (processedMessageIds.has(messageId)) {
    console.log("🛑 DUPLICATE TIKTOK EVENT IGNORED:", messageId);
    return true;
  }

  processedMessageIds.set(messageId, Date.now());
  return false;
}

function getUser(data) {
  return {
    username:
      data?.user?.uniqueId ||
      data?.user?.unique_id ||
      data?.user?.nickname ||
      "Unknown",
    nickname:
      data?.user?.nickname ||
      data?.user?.uniqueId ||
      "Unknown"
  };
}

function processGift(data) {
  if (isDuplicateMessage(data)) return;

  const { username, nickname } = getUser(data);

  const giftName = data?.gift?.name || "";
  const normalizedGift = giftName.trim().toLowerCase();

  const streak = giftStreakTracker.process(data);

  const newGiftCount =
    Number(streak?.eventGiftCount) || 0;

  if (newGiftCount <= 0) {
    console.log(`🛑 ${username} ${giftName} produced no new gifts.`);
    return;
  }

  console.log(
    `🎁 ${username} sent ${giftName} | new units=${newGiftCount}`
  );

  // Existing gift rules stay the same by gift type,
  // but the game power is now 5 / 50.
  if (normalizedGift === "rose") {
    sendGameCommand({
      type: "attack",
      side: "girl",
      brutality: false,
      power: 5,
      username,
      nickname,
      gift: giftName,
      repeatCount: newGiftCount
    });
    return;
  }

  if (normalizedGift === "rosa") {
    sendGameCommand({
      type: "attack",
      side: "girl",
      brutality: true,
      power: 50,
      username,
      nickname,
      gift: giftName,
      repeatCount: newGiftCount
    });
    return;
  }

  if (normalizedGift === "tiktok") {
    sendGameCommand({
      type: "attack",
      side: "boy",
      brutality: false,
      power: 5,
      username,
      nickname,
      gift: giftName,
      repeatCount: newGiftCount
    });
    return;
  }

  if (
    normalizedGift === "mind blown" ||
    normalizedGift === "mindblown"
  ) {
    sendGameCommand({
      type: "attack",
      side: "boy",
      brutality: true,
      power: 50,
      username,
      nickname,
      gift: giftName,
      repeatCount: newGiftCount
    });
    return;
  }

  if (
    normalizedGift === "like-pop" ||
    normalizedGift === "like pop" ||
    normalizedGift === "likepop"
  ) {
    sendGameCommand({
      type: "switchCharacter",
      side: "girl",
      username,
      nickname,
      gift: giftName,
      repeatCount: newGiftCount
    });
    return;
  }

  if (
    normalizedGift === "paper crane" ||
    normalizedGift === "papercrane"
  ) {
    sendGameCommand({
      type: "switchCharacter",
      side: "boy",
      username,
      nickname,
      gift: giftName,
      repeatCount: newGiftCount
    });
    return;
  }

  console.log("ℹ️ No action configured for:", giftName);
}

function processFollow(data) {
  if (isDuplicateMessage(data)) return;

  const { username, nickname } = getUser(data);

  console.log(`➕ FOLLOW: ${username} = 0.2 boy power`);

  // Every follow helps BOYS by 0.2.
  sendGameCommand({
    type: "socialAttack",
    side: "boy",
    power: 0.2,
    username,
    nickname,
    gift: "Follow",
    repeatCount: 1,
    socialType: "follow"
  });
}

function processLike(data) {
  // Like events are intentionally not run through the raw-message
  // duplicate checker because TikTok sends like totals in separate
  // events and LikeAccumulator is responsible for monotonizing them.
  const { username, nickname } = getUser(data);

  let stats;

  try {
    stats = likeAccumulator.process(data);
  } catch (error) {
    console.error("❌ LikeAccumulator error:", error);
    return;
  }

  const newLikes = Number(stats?.accumulatedCount) || 0;

  if (newLikes <= 0) {
    return;
  }

  likeRemainder += newLikes;

  const completedHundreds = Math.floor(likeRemainder / 100);
  likeRemainder %= 100;

  console.log(
    `❤️ LIKES: ${username} +${newLikes} | ${completedHundreds} x 100-like hit | remainder=${likeRemainder}`
  );

  if (completedHundreds <= 0) {
    return;
  }

  // Every 100 likes helps GIRLS by exactly 0.2.
  sendGameCommand({
    type: "socialAttack",
    side: "girl",
    power: 0.2,
    username,
    nickname,
    gift: "100 Likes",
    repeatCount: completedHundreds,
    socialType: "likes"
  });
}

async function connectTikTok() {
  try {
    console.log("------------------------------------");
    console.log("Connecting to TikTok LIVE...");
    console.log("Username:", TIKTOK_USERNAME);
    console.log("------------------------------------");

    giftStreakTracker = new GiftStreakTracker();
    likeAccumulator = new LikeAccumulator();
    likeRemainder = 0;

    tiktokClient = new TikTokLiveClient(TIKTOK_USERNAME);

    tiktokClient.on(EventType.connected, () => {
      tiktokConnected = true;

      console.log("====================================");
      console.log("✅ TIKTOK LIVE CONNECTED!");
      console.log("Username:", TIKTOK_USERNAME);
      console.log("====================================");

      io.emit("tiktokStatus", { connected: true });
    });

    tiktokClient.on(EventType.disconnected, () => {
      tiktokConnected = false;

      console.log("🔴 TikTok LIVE disconnected.");

      io.emit("tiktokStatus", {
        connected: false
      });
    });

    tiktokClient.on(EventType.gift, (data) => {
      console.log("🎁 RAW GIFT EVENT");
      console.log(JSON.stringify(data));
      processGift(data);
    });

    // PirateTok exposes a convenience follow event.
    tiktokClient.on(EventType.follow, (data) => {
      console.log("👤 RAW FOLLOW EVENT");
      console.log(JSON.stringify(data));
      processFollow(data);
    });

    // PirateTok exposes like events and LikeAccumulator handles
    // TikTok's inconsistent cumulative like totals.
    tiktokClient.on(EventType.like, (data) => {
      processLike(data);
    });

    await tiktokClient.connect();
  } catch (error) {
    tiktokConnected = false;

    console.error("❌ FAILED TO CONNECT TO TIKTOK LIVE");
    console.error(error);

    io.emit("tiktokStatus", {
      connected: false,
      error: String(error)
    });

    console.log("Retrying in 10 seconds...");

    setTimeout(connectTikTok, 10000);
  }
}

server.listen(PORT, () => {
  console.log("====================================");
  console.log("MORTAL KOMBAT TIKTOK SERVER");
  console.log("====================================");
  console.log(`Server running on port ${PORT}`);
  console.log(`TikTok: @${TIKTOK_USERNAME}`);
  console.log("Rules: target=100 | hit=5 | big=50 | follow=0.2 | 100 likes=0.2");
  console.log("====================================");

  connectTikTok();
});
