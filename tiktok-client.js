(function () {
  const SERVER_URL = "https://gift-battle-o0kv.onrender.com";

  const socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: true
  });

  function showStatus(message) {
    console.log(message);

    let box = document.getElementById("tiktok-debug");

    if (!box) {
      box = document.createElement("div");
      box.id = "tiktok-debug";

      box.style.position = "fixed";
      box.style.top = "5px";
      box.style.left = "5px";
      box.style.right = "5px";
      box.style.zIndex = "99999";
      box.style.padding = "8px";
      box.style.background = "rgba(0,0,0,0.9)";
      box.style.color = "#00ff00";
      box.style.fontFamily = "Arial";
      box.style.fontSize = "12px";
      box.style.border = "1px solid #00ff00";
      box.style.borderRadius = "5px";

      document.body.appendChild(box);
    }

    box.innerText = message;
  }

  socket.on("connect", () => {
    showStatus("🟢 GAME CONNECTED | SERVER ONLINE");
  });

  socket.on("connect_error", (error) => {
    showStatus("🔴 SERVER ERROR: " + error.message);
  });

  socket.on("disconnect", (reason) => {
    showStatus("🔴 SERVER DISCONNECTED: " + reason);
  });

  socket.on("tiktokStatus", (status) => {
    if (status.connected) {
      showStatus("🟢 TIKTOK LIVE CONNECTED");
    } else {
      showStatus("🟠 SERVER ONLINE / TIKTOK OFFLINE");
    }
  });

  socket.on("gameCommand", (command) => {
    const count = Math.max(
      1,
      Number(command.repeatCount) || 1
    );

    showStatus(
      `${command.socialType ? "⚡" : "🎁"} ` +
      command.username +
      " → " +
      command.gift +
      " ×" +
      count
    );

    // ------------------------------------
    // NORMAL / BIG GIFT ATTACK
    // ------------------------------------
    if (command.type === "attack") {
      let attackNumber = 0;

      function doNextAttack() {
        if (attackNumber >= count) return;

        attackNumber++;

        attack(
          command.side,
          command.brutality,
          command.username,
          command.gift,
          Number(command.power)
        );

        if (
          typeof isMatchActive !== "undefined" &&
          !isMatchActive
        ) {
          return;
        }

        setTimeout(
          doNextAttack,
          command.brutality ? 80 : 70
        );
      }

      doNextAttack();
      return;
    }

    // ------------------------------------
    // FOLLOW / 100-LIKES SOCIAL ATTACK
    // ------------------------------------
    if (command.type === "socialAttack") {
      let attackNumber = 0;

      function doNextSocialAttack() {
        if (attackNumber >= count) return;

        attackNumber++;

        attack(
          command.side,
          false,
          command.username,
          command.gift,
          0.2
        );

        if (
          typeof isMatchActive !== "undefined" &&
          !isMatchActive
        ) {
          return;
        }

        // Small delay keeps a burst of likes visible.
        setTimeout(doNextSocialAttack, 60);
      }

      doNextSocialAttack();
      return;
    }

    // ------------------------------------
    // CHARACTER SWITCH
    // ------------------------------------
    if (command.type === "switchCharacter") {
      let switchNumber = 0;

      function doNextSwitch() {
        if (switchNumber >= count) return;

        switchNumber++;

        switchCharacter(
          command.side,
          command.username,
          command.gift
        );

        setTimeout(doNextSwitch, 100);
      }

      doNextSwitch();
    }
  });
})();
