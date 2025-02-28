import * as Minecraft from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const system = Minecraft.system;
const world = Minecraft.world;

const protectionZones = new Map();
const allowedPlayers = new Map();
const activeBorders = new Map();
const intrusionLog = new Map();
const SAVE_KEY = "protectionData";
const fireCheckQueue = [];
let scanProgress = new Map();

// รายการบล็อก, ไอเทม, และเอนทิตี้ที่ถูกจำกัด
const restrictedBlocks = new Set([
  "ender_chest",
  "wheat",
  "gate",
  "trapdoor",
  "crafter",
  "anvil",
  "crafting_table",
  "candle",
  "spruce_hanging_sign",
  "minecraft:cartography_table",
  "minecraft:brewing_stand",
  "minecraft:furnace",
  "minecraft:blast_furnace",
  "minecraft:grindstone",
  "minecraft:smithing_table",
  "minecraft:ender_chest",
  "minecraft:shulker_box",
  "minecraft:hopper",
  "minecraft:flower_pot",
  "minecraft:smoker",
  "minecraft:respawn_anchor",
  "minecraft:barrel",
  "minecraft:decorated_pot",
  "minecraft:composter",
  "minecraft:room",
  "minecraft:tnt",
  "minecraft:respawn_anchor",
  "minecraft:end_portal_frame",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:dispenser",
  "minecraft:dropper",
  "minecraft:observer",
  "minecraft:chest",
  "minecraft:furnace",
  "minecraft:hopper",
  "minecraft:barrel",
  "minecraft:double_chest",
  "minecraft:ender_chest",
  "minecraft:shulker_box",
  "minecraft:beacon",
  "minecraft:brewing_stand",
  "minecraft:campfire",
  "minecraft:smoker",
  "minecraft:blast_furnace",
  "minecraft:lectern",
  "minecraft:jukebox",
  "minecraft:loom",
  "minecraft:cartography_table",
  "minecraft:stonecutter",
  "minecraft:composter",
  "minecraft:grindstone",
  "minecraft:smithing_table",
  "minecraft:anvil",
  "minecraft:enchanting_table",
  "minecraft:ender_chest",
  "minecraft:crafting_table",
  "minecraft:bell",
  "minecraft:lodestone",
  "minecraft:door",
  "minecraft:trapdoor",
  "minecraft:fence_gate",
  "minecraft:barrier",
  "minecraft:fence",
  "minecraft:iron_bars",
  "minecraft:glass_pane",
  "minecraft:tnt",
  "minecraft:flint_and_steel",
  "minecraft:fire_charge",
  "minecraft:lava_bucket",
  "minecraft:respawn_anchor",
  "minecraft:end_crystal",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:bow",
  "minecraft:crossbow",
  "minecraft:trident",
  "minecraft:fishing_rod",
  "minecraft:shield",
  "minecraft:elytra",
  "minecraft:firework_rocket",
  "minecraft:splash_potion",
  "minecraft:lingering_potion",
  "minecraft:bucket",
  "minecraft:water_bucket",
  "minecraft:flint_and_steel",
  "minecraft:fire_charge",
  "minecraft:lava_bucket",
  "minecraft:respawn_anchor",
  "minecraft:end_crystal",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:ender_pearl",
  "minecraft:eye_of_ender",
  "minecraft:goat_horn",
  "minecraft:snowball",
  "minecraft:egg",
  "minecraft:wind_charge",
]);

const restrictedEntities = {
  removeInstantly: [
    "minecraft:fireball",
    "minecraft:small_fireball",
    "minecraft:wither_skull",
    "minecraft:wither_skull_dangerous",
    "minecraft:tnt",
    "minecraft:creeper",
    "minecraft:phantom",
    "minecraft:wind_charge_projectile",
    "minecraft:wind_charge",
    "minecraft:firework_rocket",
    "minecraft:firework_star",
    "minecraft:firework",
    "minecraft:firework_charge",
    "minecraft:egg",
    "minecraft:ender_pearl",
    "minecraft:experience_bottle",
    "minecraft:snowball",
    "minecraft:splash_potion",
    "minecraft:lingering_potion",
    "minecraft:trident",
    "minecraft:arrow",
    "minecraft:thrown_trident",
    "minecraft:lightning_bolt",
    "minecraft:fishing_hook",
  ],
  preventSpawn: [
    "minecraft:zombie",
    "minecraft:skeleton",
    "minecraft:spider",
    "minecraft:enderman",
    "minecraft:witch",
    "minecraft:ghast",
    "minecraft:magma_cube",
    "minecraft:slime",
    "minecraft:blaze",
    "minecraft:evoker",
    "minecraft:wind_charge_projectile",
    "minecraft:wind_charge",
    "minecraft:fireball",
    "minecraft:small_fireball",
  ],
  bounceOnly: [
    "minecraft:wither",
    "minecraft:warden",
    "minecraft:ravager",
    "minecraft:vex",
    "minecraft:pillager",
  ],
  noInteraction: [
    "minecraft:villager",
    "minecraft:item_frame",
    "minecraft:armor_stand",
    "minecraft:wandering_trader",
    "minecraft:boat",
    "minecraft:minecart",
    "minecraft:chest_minecart",
    "minecraft:hopper_minecart",
  ],
};

/*----------------------------------------------------------------------------------------------------
 📍 [Zone Utilities] 
----------------------------------------------------------------------------------------------------*/
function formatDateTime(date) {
  const localOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const utc7OffsetMs = 7 * 60 * 60 * 1000;
  const adjustedTime = date.getTime() - localOffsetMs + utc7OffsetMs;
  const utcDate = new Date(adjustedTime);

  const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcDate.getUTCDate()).padStart(2, "0");
  const year = utcDate.getUTCFullYear();
  const hours = String(utcDate.getUTCHours()).padStart(2, "0");
  const minutes = String(utcDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(utcDate.getUTCSeconds()).padStart(2, "0");
  const formatted = `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
  console.warn(`[DEBUG] formatDateTime: ${formatted}`);
  return formatted;
}

function isInsideZone(location) {
  if (!location || typeof location.x !== "number") return [];
  const zonesFound = [];
  for (const [, zoneData] of protectionZones) {
    const { start, end, owner } = zoneData || {};
    if (!start || !end || !owner) continue;
    if (
      location.x >= start.x &&
      location.x <= end.x &&
      location.y >= start.y &&
      location.y <= end.y &&
      location.z >= start.z &&
      location.z <= end.z
    ) {
      zonesFound.push({ owner, zone: zoneData });
    }
  }
  return zonesFound;
}

function canAccess(player, zoneOwner) {
  return player.name === zoneOwner || (allowedPlayers.get(zoneOwner) || []).includes(player.name);
}

function pushOutOfZone(entity, zone) {
  console.warn(
    `[DEBUG] pushOutOfZone called for entity at (${entity.location.x}, ${entity.location.y}, ${entity.location.z}) in zone of ${zone.owner}`
  );
  const centerX = (zone.start.x + zone.end.x) / 2;
  const centerZ = (zone.start.z + zone.end.z) / 2;
  const dx = entity.location.x - centerX;
  const dz = entity.location.z - centerZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  console.warn(`[DEBUG] Distance from center: ${distance}, dx: ${dx}, dz: ${dz}`);

  if (distance > 0) {
    const force = 10;
    entity.applyKnockback(dx / distance, dz / distance, force, 0.1);
    console.warn(`[DEBUG] Applied knockback to entity`);
    return true;
  }
  console.warn(`[DEBUG] No knockback applied, distance <= 0`);
  return false;
}

/*----------------------------------------------------------------------------------------------------
 💾 [Data Management] 
----------------------------------------------------------------------------------------------------*/
let saveTimeout = null;
function saveZones() {
  if (saveTimeout) system.clearRun(saveTimeout);
  saveTimeout = system.runTimeout(() => {
    const data = {
      zones: Array.from(protectionZones.entries()),
      permissions: Array.from(allowedPlayers.entries()),
      intrusions: Array.from(intrusionLog.entries()),
    };
    world.setDynamicProperty(SAVE_KEY, JSON.stringify(data));
    console.warn(`[DEBUG] Data saved to dynamic property`);
    saveTimeout = null;
  }, 100); // บันทึกหลังหน่วง 5 วินาที
}

function loadZones() {
  console.warn(`[DEBUG] loadZones called`);
  const savedData = world.getDynamicProperty(SAVE_KEY);
  if (savedData && typeof savedData === "string") {
    console.warn(`[DEBUG] Saved data found: ${savedData.substring(0, 50)}...`);
    try {
      const parsedData = JSON.parse(savedData);
      parsedData.zones.forEach(([key, value]) => {
        protectionZones.set(key, value);
        console.warn(
          `[DEBUG] Loaded zone for ${key} at (${value.coordinates.x}, ${value.coordinates.y}, ${value.coordinates.z})`
        );
      });
      parsedData.permissions.forEach(([key, value]) => {
        allowedPlayers.set(key, value);
        console.warn(`[DEBUG] Loaded permissions for ${key}: ${value}`);
      });
      parsedData.intrusions?.forEach(([key, value]) => {
        intrusionLog.set(key, value);
        console.warn(`[DEBUG] Loaded intrusions for ${key}: ${value.length} entries`);
      });
      console.warn(
        `[DEBUG] Load completed - Zones: ${protectionZones.size}, Permissions: ${allowedPlayers.size}, Intrusions: ${intrusionLog.size}`
      );
    } catch (e) {
      console.error("Error parsing saved data: " + (e instanceof Error ? e.message : String(e)));
    }
  } else {
    console.warn(`[DEBUG] No saved data found`);
  }
}

loadZones();

/*----------------------------------------------------------------------------------------------------
 🌍 [World Initialization] 
----------------------------------------------------------------------------------------------------*/
console.warn(formatDateTime(new Date()));
world.afterEvents.worldInitialize.subscribe(() => {
  console.warn(`[DEBUG] World initialized`);
  for (const player of world.getPlayers()) {
    console.warn(`Player ${player.name} is online`);
  }
});

/*----------------------------------------------------------------------------------------------------
 🧭 [Main Menu] 
----------------------------------------------------------------------------------------------------*/

world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  if (event.itemStack?.typeId === "minecraft:compass") showMainMenu(player);
});

function showMainMenu(player) {
  const zone = protectionZones.get(player.name);
  const protectionStatus = zone && zone.protectionEnabled ? "§aเปิด" : "§cปิด";
  const menu = new ActionFormData()
    .title("Zone Control")
    .body(`Time: ${formatDateTime(new Date())}`);

  menu.button(zone ? "ตั้งค่า" : "สร้างเขตแดน");
  if (zone) menu.button(`ป้องกัน: ${protectionStatus}`);
  if (player.hasTag("admin")) menu.button("เมนูแอดมิน");

  menu.show(player).then((response) => {
    if (response.canceled) return;
    switch (response.selection) {
      case 0:
        if (zone) showSettings(player);
        else createZone(player);
        break;
      case 1:
        if (zone) toggleProtection(player);
        break;
      case 2:
        if (player.hasTag("admin")) showAdminMenu(player);
        break;
    }
  });
}

/*----------------------------------------------------------------------------------------------------
 ⚙️ [Settings Menu] 
----------------------------------------------------------------------------------------------------*/
function showSettings(player) {
  console.warn(`[DEBUG] showSettings called for ${player.name}`);
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    console.warn(`[DEBUG] No zone found for ${player.name}`);
    return;
  }

  const showBorderStatus = activeBorders.has(player.name) ? "§aเปิด" : "§cปิด";
  const bounceStatus = zone.bounceNonPlayers ? "§aเปิด" : "§cปิด";
  const visitStatus = zone.visitMode ? "§aเปิด" : "§cปิด";
  console.warn(
    `[DEBUG] Zone settings - Border: ${showBorderStatus}, Bounce: ${bounceStatus}, Visit: ${visitStatus}`
  );

  const settingsMenu = new ActionFormData()
    .title("ตั้งค่าเขตป้องกัน")
    .body("เลือกการตั้งค่า\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("เพิ่มเพื่อน")
    .button("ลบเพื่อน")
    .button(`แสดงขอบเขต ${showBorderStatus}`)
    .button(`กระเด็นหากไม่ใช่ผู้เล่น ${bounceStatus}`)
    .button("ลบเขต")
    .button(`โหมดเยี่ยมชม ${visitStatus}`);

  settingsMenu.show(player).then((response) => {
    if (response.canceled) {
      console.warn(`[DEBUG] Settings menu canceled by ${player.name}`);
      return;
    }
    console.warn(`[DEBUG] Settings menu selection by ${player.name}: ${response.selection}`);
    switch (response.selection) {
      case 0:
        addFriend(player);
        break;
      case 1:
        removeFriend(player);
        break;
      case 2:
        showZoneBorder(player);
        break;
      case 3:
        toggleBounceNonPlayers(player);
        break;
      case 4:
        deleteZone(player);
        break;
      case 5:
        toggleVisitMode(player);
        break;
    }
  });
}

/*----------------------------------------------------------------------------------------------------
 👥 [Friend Management] 
----------------------------------------------------------------------------------------------------*/
function addFriend(player) {
  const allPlayers = world.getPlayers();
  const friendNames = allPlayers.map((p) => p.name).filter((name) => name !== player.name);
  if (friendNames.length === 0) {
    player.sendMessage("§cไม่มีใครให้เพิ่มในโลกนี้!");
    return;
  }

  const friendMenu = new ModalFormData()
    .title("เพิ่มเพื่อน")
    .dropdown("เลือกเพื่อน", friendNames, 0);
  friendMenu.show(player).then((response) => {
    if (
      response.canceled ||
      !Array.isArray(response.formValues) ||
      response.formValues.length === 0
    ) {
      console.warn(`[DEBUG] Friend menu canceled or invalid response by ${player.name}`);
      return;
    }
    const friendIndex = Number(response.formValues[0]);
    if (isNaN(friendIndex) || friendIndex < 0 || friendIndex >= friendNames.length) return;

    const friendName = friendNames[friendIndex];
    const permissions = allowedPlayers.get(player.name) || [];
    if (!permissions.includes(friendName)) {
      permissions.push(friendName);
      allowedPlayers.set(player.name, permissions);
      saveZones();
      player.sendMessage(`§aเพิ่ม ${friendName} เป็นผู้มีสิทธิ์แล้ว!`);
    }
  });
}

function removeFriend(player) {
  console.warn(`[DEBUG] removeFriend called for ${player.name}`);
  const permissions = allowedPlayers.get(player.name) || [];
  if (permissions.length === 0) {
    player.sendMessage("§cไม่มีเพื่อนให้ลบ!");
    console.warn(`[DEBUG] No friends to remove for ${player.name}`);
    return;
  }

  const friendMenu = new ModalFormData()
    .title("ลบเพื่อน")
    .dropdown("เลือกเพื่อนที่ต้องการลบ", permissions, 0);
  friendMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) {
      console.warn(`[DEBUG] Remove friend menu canceled by ${player.name}`);
      return;
    }
    const friendName = permissions[Number(response.formValues[0])];
    const index = permissions.indexOf(friendName);
    console.warn(`[DEBUG] Selected friend to remove: ${friendName}, Index: ${index}`);
    if (index !== -1) {
      permissions.splice(index, 1);
      allowedPlayers.set(player.name, permissions);
      saveZones();
      player.sendMessage(`§aลบ ${friendName} ออกจากผู้มีสิทธิ์แล้ว!`);
      console.warn(
        `[DEBUG] Removed ${friendName} from ${player.name}'s permissions: ${permissions}`
      );
    }
  });
}

/*----------------------------------------------------------------------------------------------------
 🔧 [Zone Settings] 
----------------------------------------------------------------------------------------------------*/
function toggleBounceNonPlayers(player) {
  console.warn(`[DEBUG] toggleBounceNonPlayers called for ${player.name}`);
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    console.warn(`[DEBUG] No zone found for ${player.name}`);
    return;
  }

  zone.bounceNonPlayers = !zone.bounceNonPlayers;
  protectionZones.set(player.name, zone);
  saveZones();
  player.sendMessage(
    zone.bounceNonPlayers
      ? "§aเปิดการกระเด็นสำหรับสิ่งที่ไม่ใช่ผู้เล่นแล้ว!"
      : "§cปิดการกระเด็นสำหรับสิ่งที่ไม่ใช่ผู้เล่นแล้ว!"
  );
  console.warn(`[DEBUG] BounceNonPlayers set to ${zone.bounceNonPlayers} for ${player.name}`);
}

function toggleVisitMode(player) {
  console.warn(`[DEBUG] toggleVisitMode called for ${player.name}`);
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    console.warn(`[DEBUG] No zone found for ${player.name}`);
    return;
  }

  zone.visitMode = !zone.visitMode;
  protectionZones.set(player.name, zone);
  saveZones();
  player.sendMessage(zone.visitMode ? "§aเปิดโหมดเยี่ยมชมแล้ว!" : "§cปิดโหมดเยี่ยมชมแล้ว!");
  console.warn(`[DEBUG] VisitMode set to ${zone.visitMode} for ${player.name}`);
}

/*----------------------------------------------------------------------------------------------------
 🗑️ [Zone Removal] 
----------------------------------------------------------------------------------------------------*/
function removePlayerFromZone(player, isAdmin = false) {
  console.warn(`[DEBUG] removePlayerFromZone called for ${player.name}, isAdmin: ${isAdmin}`);
  const zone = protectionZones.get(player.name);
  const allZones = Array.from(protectionZones.keys());

  if (!isAdmin && !zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    console.warn(`[DEBUG] No zone found for ${player.name} (non-admin)`);
    return;
  }

  if (isAdmin && allZones.length === 0) {
    player.sendMessage("§cไม่มีเขตป้องกันในโลกนี้!");
    console.warn(`[DEBUG] No zones in world (admin mode)`);
    return;
  }

  let targetOwner = player.name;
  if (isAdmin) {
    const zoneMenu = new ActionFormData()
      .title("เลือกเขตเพื่อลบผู้เล่น")
      .body("เลือกเขตที่ต้องการลบผู้เล่น")
      .button("กลับไปเมนูแอดมิน");

    allZones.forEach((owner) => zoneMenu.button(owner));
    console.warn(`[DEBUG] Showing admin zone menu with ${allZones.length} zones`);

    zoneMenu.show(player).then((response) => {
      if (response.canceled || response.selection === 0) {
        console.warn(`[DEBUG] Admin zone menu canceled or back selected by ${player.name}`);
        showAdminMenu(player);
        return;
      }
      targetOwner = allZones[response.selection - 1];
      console.warn(`[DEBUG] Admin selected zone owner: ${targetOwner}`);
      proceedWithRemoval(player, targetOwner, isAdmin);
    });
  } else {
    proceedWithRemoval(player, targetOwner, isAdmin);
  }
}

function proceedWithRemoval(player, targetOwner, isAdmin) {
  console.warn(
    `[DEBUG] proceedWithRemoval called - Player: ${player.name}, TargetOwner: ${targetOwner}, isAdmin: ${isAdmin}`
  );
  const dimension = world.getDimension("minecraft:overworld");
  const playersInZone = dimension.getPlayers().filter((p) => {
    const zones = isInsideZone(p.location);
    return zones.some((z) => z.owner === targetOwner) && p.name !== targetOwner;
  });
  console.warn(`[DEBUG] Found ${playersInZone.length} players in zone of ${targetOwner}`);

  if (playersInZone.length === 0) {
    player.sendMessage(`§cไม่มีผู้เล่นอื่นในเขต${isAdmin ? `ของ ${targetOwner}` : "ของคุณ"}!`);
    console.warn(`[DEBUG] No players found in zone`);
    return;
  }

  const removeMenu = new ActionFormData()
    .title(`ลบผู้เล่นในเขต${isAdmin ? `ของ ${targetOwner}` : ""}`)
    .body("เลือกผู้เล่นที่ต้องการลบออกจากเขต")
    .button(isAdmin ? "กลับไปเมนูแอดมิน" : "กลับไปเมนูหลัก");

  playersInZone.forEach((p) => removeMenu.button(p.name));
  console.warn(`[DEBUG] Showing remove menu with ${playersInZone.length} players`);

  removeMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(`[DEBUG] Remove menu canceled or back selected by ${player.name}`);
      if (isAdmin) showAdminMenu(player);
      else showMainMenu(player);
      return;
    }

    const selectedPlayer = playersInZone[response.selection - 1];
    selectedPlayer.remove();
    player.sendMessage(
      `§aลบ ${selectedPlayer.name} ออกจากเขต${isAdmin ? `ของ ${targetOwner}` : ""} สำเร็จ!`
    );
    selectedPlayer.sendMessage(
      `§cคุณถูกลบออกจากเขตของ ${targetOwner} ${isAdmin ? "โดยแอดมิน" : ""}!`
    );
    console.warn(`[DEBUG] Removed ${selectedPlayer.name} from zone of ${targetOwner}`);
  });
}

/*----------------------------------------------------------------------------------------------------
 👑 [Admin Menu] 
----------------------------------------------------------------------------------------------------*/
function showAdminMenu(player) {
  console.warn(`[DEBUG] showAdminMenu called for ${player.name}`);
  if (!player.hasTag("admin")) {
    player.sendMessage("§cคุณไม่มีสิทธิ์ใช้เมนูแอดมิน!");
    console.warn(`[DEBUG] ${player.name} lacks admin tag`);
    return;
  }

  const adminMenu = new ActionFormData()
    .title("เมนูแอดมิน")
    .body("เลือกสิ่งที่ต้องการทำ\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("ดูข้อมูลเขต")
    .button("ลบเขต")
    .button("ลบผู้เล่นในเขต")
    .button("ดูรายงานการบุกรุก")
    .button("จัดการประวัติการบุกรุก");

  adminMenu.show(player).then((response) => {
    if (response.canceled) {
      console.warn(`[DEBUG] Admin menu canceled by ${player.name}`);
      return;
    }
    console.warn(`[DEBUG] Admin menu selection by ${player.name}: ${response.selection}`);
    switch (response.selection) {
      case 0:
        showAdminZoneInfo(player);
        break;
      case 1:
        deleteAdminZone(player);
        break;
      case 2:
        removePlayerFromZone(player, true);
        break;
      case 3:
        showIntrusionLog(player);
        break;
      case 4:
        manageIntrusionLog(player);
        break;
    }
  });
}

function showIntrusionLog(player) {
  console.warn(`[DEBUG] showIntrusionLog called for ${player.name}`);
  const allZones = Array.from(protectionZones.keys());
  if (allZones.length === 0) {
    player.sendMessage("§cไม่มีเขตป้องกันในโลกนี้!");
    console.warn(`[DEBUG] No zones in world`);
    return;
  }

  const zoneMenu = new ActionFormData()
    .title("เลือกเขตเพื่อดูรายงานการบุกรุก")
    .body("เลือกเขตที่ต้องการตรวจสอบ")
    .button("กลับไปเมนูแอดมิน");

  allZones.forEach((owner) => zoneMenu.button(owner));
  console.warn(`[DEBUG] Showing intrusion zone menu with ${allZones.length} zones`);

  zoneMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(`[DEBUG] Intrusion zone menu canceled or back selected by ${player.name}`);
      showAdminMenu(player);
      return;
    }

    const selectedOwner = allZones[response.selection - 1];
    const logs = intrusionLog.get(selectedOwner) || [];
    console.warn(`[DEBUG] Selected owner: ${selectedOwner}, Logs: ${logs.length}`);
    if (logs.length === 0) {
      player.sendMessage(`§eไม่มีบันทึกการบุกรุกในเขตของ ${selectedOwner}!`);
      console.warn(`[DEBUG] No intrusion logs for ${selectedOwner}`);
      return;
    }

    const logMenu = new ActionFormData()
      .title(`รายงานการบุกรุกของ ${selectedOwner}`)
      .body(`พบการบุกรุก ${logs.length} ครั้ง`)
      .button("กลับไปเมนูแอดมิน");

    logs.forEach((log, index) => {
      logMenu.button(
        `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
          log.location.z
        })`
      );
    });

    logMenu.show(player).then((response) => {
      if (response.canceled || response.selection === 0) {
        console.warn(`[DEBUG] Intrusion log menu canceled or back selected by ${player.name}`);
        showAdminMenu(player);
      }
    });
  });
}

/*----------------------------------------------------------------------------------------------------
 📜 [Intrusion Log Management] 
----------------------------------------------------------------------------------------------------*/
function manageIntrusionLog(player) {
  console.warn(`[DEBUG] manageIntrusionLog called for ${player.name}`);
  const allZones = Array.from(protectionZones.keys());
  if (allZones.length === 0) {
    player.sendMessage("§cไม่มีเขตป้องกันในโลกนี้!");
    console.warn(`[DEBUG] No zones in world`);
    return;
  }

  const zoneMenu = new ActionFormData()
    .title("เลือกเขตเพื่อจัดการประวัติ")
    .body("เลือกเขตที่ต้องการจัดการประวัติการบุกรุก")
    .button("กลับไปเมนูแอดมิน");

  allZones.forEach((owner) => zoneMenu.button(owner));
  console.warn(`[DEBUG] Showing intrusion manage menu with ${allZones.length} zones`);

  zoneMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(`[DEBUG] Intrusion manage menu canceled or back selected by ${player.name}`);
      showAdminMenu(player);
      return;
    }

    const selectedOwner = allZones[response.selection - 1];
    console.warn(`[DEBUG] Selected owner for intrusion management: ${selectedOwner}`);
    showIntrusionManagementOptions(player, selectedOwner);
  });
}

function showIntrusionManagementOptions(player, zoneOwner) {
  console.warn(
    `[DEBUG] showIntrusionManagementOptions called for ${player.name}, ZoneOwner: ${zoneOwner}`
  );
  const logs = intrusionLog.get(zoneOwner) || [];
  const menu = new ActionFormData()
    .title(`จัดการประวัติของ ${zoneOwner}`)
    .body(`มีประวัติทั้งหมด ${logs.length} รายการ`)
    .button("ดูประวัติ")
    .button("ลบประวัติทีละรายการ")
    .button("ลบประวัติทั้งหมด")
    .button("ค้นหาด้วยชื่อผู้บุกรุก")
    .button("กลับไปเมนูแอดมิน");

  menu.show(player).then((response) => {
    if (response.canceled) {
      console.warn(`[DEBUG] Intrusion management options canceled by ${player.name}`);
      return;
    }
    console.warn(`[DEBUG] Intrusion management selection by ${player.name}: ${response.selection}`);
    switch (response.selection) {
      case 0:
        showIntrusionLog(player);
        break;
      case 1:
        deleteSingleIntrusion(player, zoneOwner);
        break;
      case 2:
        deleteAllIntrusions(player, zoneOwner);
        break;
      case 3:
        searchIntrusionByName(player, zoneOwner);
        break;
      case 4:
        showAdminMenu(player);
        break;
    }
  });
}

function deleteSingleIntrusion(player, zoneOwner) {
  console.warn(`[DEBUG] deleteSingleIntrusion called for ${player.name}, ZoneOwner: ${zoneOwner}`);
  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length === 0) {
    player.sendMessage(`§eไม่มีประวัติการบุกรุกในเขตของ ${zoneOwner}!`);
    console.warn(`[DEBUG] No intrusion logs for ${zoneOwner}`);
    return;
  }

  const logMenu = new ActionFormData()
    .title(`ลบประวัติของ ${zoneOwner}`)
    .body("เลือกประวัติที่ต้องการลบ")
    .button("กลับไปเมนูจัดการ");

  logs.forEach((log, index) => {
    logMenu.button(
      `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
        log.location.z
      })`
    );
  });

  logMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(
        `[DEBUG] Delete single intrusion menu canceled or back selected by ${player.name}`
      );
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const indexToDelete = response.selection - 1;
    console.warn(`[DEBUG] Selected log to delete: ${indexToDelete}`);
    logs.splice(indexToDelete, 1);
    intrusionLog.set(zoneOwner, logs);
    saveZones();
    player.sendMessage(`§aลบประวัติการบุกรุกรายการที่ ${indexToDelete + 1} สำเร็จ!`);
    console.warn(`[DEBUG] Deleted intrusion log at index ${indexToDelete} for ${zoneOwner}`);
    showIntrusionManagementOptions(player, zoneOwner);
  });
}

function deleteAllIntrusions(player, zoneOwner) {
  console.warn(`[DEBUG] deleteAllIntrusions called for ${player.name}, ZoneOwner: ${zoneOwner}`);
  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length === 0) {
    player.sendMessage(`§eไม่มีประวัติการบุกรุกในเขตของ ${zoneOwner}!`);
    console.warn(`[DEBUG] No intrusion logs for ${zoneOwner}`);
    return;
  }

  const confirmMenu = new ActionFormData()
    .title("ยืนยันการลบทั้งหมด")
    .body(`คุณต้องการลบประวัติทั้งหมด ${logs.length} รายการของ ${zoneOwner} หรือไม่?`)
    .button("ใช่ ลบทั้งหมด")
    .button("ไม่ กลับไปเมนูจัดการ");

  confirmMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 1) {
      console.warn(`[DEBUG] Delete all intrusions canceled or declined by ${player.name}`);
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    intrusionLog.delete(zoneOwner);
    saveZones();
    player.sendMessage(`§aลบประวัติการบุกรุกทั้งหมดของ ${zoneOwner} สำเร็จ!`);
    console.warn(`[DEBUG] All intrusion logs deleted for ${zoneOwner}`);
    showIntrusionManagementOptions(player, zoneOwner);
  });
}

function searchIntrusionByName(player, zoneOwner) {
  console.warn(`[DEBUG] searchIntrusionByName called for ${player.name}, ZoneOwner: ${zoneOwner}`);
  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length === 0) {
    player.sendMessage(`§eไม่มีประวัติการบุกรุกในเขตของ ${zoneOwner}!`);
    console.warn(`[DEBUG] No intrusion logs for ${zoneOwner}`);
    return;
  }

  const searchMenu = new ModalFormData()
    .title("ค้นหาด้วยชื่อผู้บุกรุก")
    .textField("กรอกชื่อผู้บุกรุก (เช่น [Steve])", "เช่น [Steve]");

  searchMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) {
      console.warn(`[DEBUG] Search intrusion menu canceled by ${player.name}`);
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const inputValue = response.formValues[0];
    let searchName = typeof inputValue === "string" ? inputValue.trim() : String(inputValue).trim();
    if (searchName.startsWith("[") && searchName.endsWith("]")) {
      searchName = searchName.slice(1, -1);
    }
    console.warn(`[DEBUG] Search term: ${searchName}`);

    const filteredLogs = logs.filter((log) =>
      log.intruder.toLowerCase().includes(searchName.toLowerCase())
    );
    if (filteredLogs.length === 0) {
      player.sendMessage(`§eไม่พบประวัติการบุกรุกของ "${searchName}" ในเขตของ ${zoneOwner}!`);
      console.warn(`[DEBUG] No matching intrusion logs for "${searchName}"`);
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const resultMenu = new ActionFormData()
      .title(`ผลการค้นหา "${searchName}"`)
      .body(`พบ ${filteredLogs.length} รายการสำหรับ "${searchName}"`)
      .button("ลบรายการที่เลือก")
      .button("กลับไปเมนูจัดการ");

    filteredLogs.forEach((log, index) => {
      resultMenu.button(
        `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
          log.location.z
        })`
      );
    });

    resultMenu.show(player).then((response) => {
      if (response.canceled || response.selection === 1) {
        console.warn(`[DEBUG] Search result menu canceled or back selected by ${player.name}`);
        showIntrusionManagementOptions(player, zoneOwner);
        return;
      }

      if (response.selection === 0) {
        console.warn(`[DEBUG] Proceeding to delete filtered intrusion for ${player.name}`);
        deleteFilteredIntrusion(player, zoneOwner, filteredLogs);
      }
    });
  });
}

function deleteFilteredIntrusion(player, zoneOwner, filteredLogs) {
  console.warn(
    `[DEBUG] deleteFilteredIntrusion called for ${player.name}, ZoneOwner: ${zoneOwner}, FilteredLogs: ${filteredLogs.length}`
  );
  const deleteMenu = new ActionFormData()
    .title("ลบประวัติที่ค้นหา")
    .body("เลือกประวัติที่ต้องการลบ")
    .button("กลับไปเมนูค้นหา");

  filteredLogs.forEach((log, index) => {
    deleteMenu.button(
      `${index + 1}. ${log.intruder} - ${log.timestamp} (${log.location.x}, ${log.location.y}, ${
        log.location.z
      })`
    );
  });

  deleteMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(
        `[DEBUG] Delete filtered intrusion menu canceled or back selected by ${player.name}`
      );
      showIntrusionManagementOptions(player, zoneOwner);
      return;
    }

    const indexToDelete = response.selection - 1;
    const logToDelete = filteredLogs[indexToDelete];
    const logs = intrusionLog.get(zoneOwner);
    const globalIndex = logs.findIndex(
      (log) =>
        log.intruder === logToDelete.intruder &&
        log.timestamp === logToDelete.timestamp &&
        log.location.x === logToDelete.location.x &&
        log.location.y === logToDelete.location.y &&
        log.location.z === logToDelete.location.z
    );
    console.warn(`[DEBUG] Deleting log at index ${indexToDelete}, GlobalIndex: ${globalIndex}`);

    if (globalIndex !== -1) {
      logs.splice(globalIndex, 1);
      intrusionLog.set(zoneOwner, logs);
      saveZones();
      player.sendMessage(`§aลบประวัติการบุกรุกรายการที่ ${indexToDelete + 1} สำเร็จ!`);
      console.warn(
        `[DEBUG] Deleted filtered intrusion log at index ${globalIndex} for ${zoneOwner}`
      );
    }
    showIntrusionManagementOptions(player, zoneOwner);
  });
}

function showAdminZoneInfo(player) {
  console.warn(`[DEBUG] showAdminZoneInfo called for ${player.name}`);
  const allPlayers = Array.from(protectionZones.keys());
  const adminMenu = new ActionFormData()
    .title("ข้อมูลเขตทั้งหมด")
    .body("เลือกผู้เล่นเพื่อดูข้อมูลเขต\n§7เวลาปัจจุบัน: " + formatDateTime(new Date()))
    .button("กลับไปเมนูแอดมิน");

  allPlayers.forEach((playerName) => adminMenu.button(playerName));
  console.warn(`[DEBUG] Showing admin zone info menu with ${allPlayers.length} players`);

  adminMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(`[DEBUG] Admin zone info menu canceled or back selected by ${player.name}`);
      showAdminMenu(player);
      return;
    }

    const selectedPlayer = allPlayers[response.selection - 1];
    const zone = protectionZones.get(selectedPlayer);
    console.warn(`[DEBUG] Selected player: ${selectedPlayer}, Zone exists: ${!!zone}`);
    if (zone) {
      const info =
        `§eข้อมูลเขตของ ${selectedPlayer}:\n` +
        `พิกัด: (${zone.coordinates.x}, ${zone.coordinates.y}, ${zone.coordinates.z})\n` +
        `สร้างเมื่อ: ${zone.createdAt}\n` +
        `สถานะขอบเขต: ${activeBorders.has(selectedPlayer) ? "§aเปิด" : "§cปิด"}\n` +
        `ระบบป้องกัน: ${zone.protectionEnabled ? "§aเปิด" : "§cปิด"}`;
      player.sendMessage(info);
      console.warn(`[DEBUG] Displayed zone info for ${selectedPlayer}`);
    } else {
      player.sendMessage("§cไม่พบข้อมูลเขตของผู้เล่นนี้!");
      console.warn(`[DEBUG] No zone found for ${selectedPlayer}`);
    }
  });
}

function deleteAdminZone(player) {
  console.warn(`[DEBUG] deleteAdminZone called for ${player.name}`);
  const allPlayers = Array.from(protectionZones.keys());
  const adminMenu = new ActionFormData()
    .title("ลบเขตผู้เล่น")
    .body("เลือกผู้เล่นที่ต้องการลบเขต")
    .button("กลับไปเมนูแอดมิน");

  allPlayers.forEach((playerName) => adminMenu.button(playerName));
  console.warn(`[DEBUG] Showing admin delete zone menu with ${allPlayers.length} players`);

  adminMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 0) {
      console.warn(`[DEBUG] Admin delete zone menu canceled or back selected by ${player.name}`);
      showAdminMenu(player);
      return;
    }

    const selectedPlayer = allPlayers[response.selection - 1];
    const zone = protectionZones.get(selectedPlayer);
    console.warn(
      `[DEBUG] Selected player to delete zone: ${selectedPlayer}, Zone exists: ${!!zone}`
    );
    if (zone) {
      const confirmMenu = new ActionFormData()
        .title("ยืนยันการลบเขต")
        .body(`คุณต้องการลบเขตของ ${selectedPlayer} จริงๆ หรือไม่?`)
        .button("ใช่ ลบเลย")
        .button("ไม่ ยกเลิก");

      confirmMenu.show(player).then((response) => {
        if (response.canceled || response.selection === 1) {
          player.sendMessage("§eยกเลิกการลบเขต!");
          console.warn(`[DEBUG] Zone deletion canceled by ${player.name}`);
          return;
        }

        if (activeBorders.has(selectedPlayer)) {
          system.clearRun(activeBorders.get(selectedPlayer));
          activeBorders.delete(selectedPlayer);
          console.warn(`[DEBUG] Cleared border interval for ${selectedPlayer}`);
        }

        protectionZones.delete(selectedPlayer);
        allowedPlayers.delete(selectedPlayer);
        saveZones();
        player.sendMessage(`§aลบเขตของ ${selectedPlayer} สำเร็จ!`);
        console.warn(`[DEBUG] Zone deleted for ${selectedPlayer}`);
      });
    } else {
      player.sendMessage("§cไม่พบเขตของผู้เล่นนี้!");
      console.warn(`[DEBUG] No zone found for ${selectedPlayer}`);
    }
  });
}

/*----------------------------------------------------------------------------------------------------
 🏰 [Zone Creation & Deletion] 
----------------------------------------------------------------------------------------------------*/
function isWithinRequiredDistance(location) {
  console.warn(
    `[DEBUG] isWithinRequiredDistance called with location: x:${location?.x}, y:${location?.y}, z:${location?.z}`
  );
  if (!location || typeof location.x !== "number") {
    console.warn(`[DEBUG] Invalid location, returning false`);
    return { isWithin: false };
  }
  const minDistanceBuffer = 50;

  for (const [, zoneData] of protectionZones) {
    const { coordinates, size, owner } = zoneData || {};
    if (!coordinates || typeof size !== "number" || !owner) {
      console.warn(`[DEBUG] Skipping invalid zone data for ${owner || "unknown"}`);
      continue;
    }

    const distanceX = Math.abs(location.x - coordinates.x);
    const distanceY = Math.abs(location.y - coordinates.y);
    const distanceZ = Math.abs(location.z - coordinates.z);
    const requiredDistance = size + minDistanceBuffer;
    console.warn(
      `[DEBUG] Checking zone of ${owner} at (${coordinates.x}, ${coordinates.y}, ${coordinates.z}), Distance: X:${distanceX}, Y:${distanceY}, Z:${distanceZ}, Required: ${requiredDistance}`
    );

    if (
      distanceX <= requiredDistance &&
      distanceY <= requiredDistance &&
      distanceZ <= requiredDistance
    ) {
      console.warn(`[DEBUG] Location within required distance of ${owner}'s zone`);
      return { isWithin: true, owner, zone: zoneData };
    }
  }
  console.warn(`[DEBUG] Location not within any zone's required distance`);
  return { isWithin: false };
}

function createZone(player) {
  console.warn(`[DEBUG] createZone called for ${player.name}`);
  if (player.dimension.id !== "minecraft:overworld") {
    player.sendMessage("§cคุณสามารถสร้างเขตป้องกันได้เฉพาะใน Overworld เท่านั้น!");
    console.warn(
      `[DEBUG] Player ${player.name} not in Overworld, dimension: ${player.dimension.id}`
    );
    return;
  }
  if (protectionZones.size >= 50) {
    player.sendMessage("§cถึงขีดจำกัดจำนวนเขตสูงสุดในโลก (50 เขต)!");
    console.warn(`[DEBUG] Zone limit reached: ${protectionZones.size}`);
    return;
  }

  if (protectionZones.has(player.name)) {
    player.sendMessage("§cคุณมีเขตป้องกันแล้ว! คนละ 1 เขตเท่านั้น!");
    console.warn(`[DEBUG] Player ${player.name} already has a zone`);
    return;
  }

  const totalPlayers = world.getPlayers().length;
  const zonesCreated = protectionZones.size;
  player.sendMessage(`§eขณะนี้มี ${zonesCreated}/${totalPlayers} เขตที่ถูกสร้างแล้ว`);
  console.warn(`[DEBUG] Total players: ${totalPlayers}, Zones created: ${zonesCreated}`);

  const sizeMenu = new ModalFormData()
    .title("สร้างเขตป้องกันใหม่")
    .slider("เลือกขนาดเขต (บล็อก)", 5, 30, 5, 10);

  sizeMenu.show(player).then((response) => {
    if (response.canceled || !response.formValues) {
      console.warn(`[DEBUG] Zone creation canceled or no form values for ${player.name}`);
      return;
    }

    const fullSize = Number(response.formValues[0]);
    const zoneSize = Math.floor(fullSize / 2);
    const pos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    };
    console.warn(`[DEBUG] Player ${player.name} selected size: ${fullSize}, zoneSize: ${zoneSize}`);
    console.warn(`[DEBUG] New zone position: x:${pos.x}, y:${pos.y}, z:${pos.z}`);

    const newZone = {
      start: { x: pos.x - zoneSize, y: pos.y - zoneSize, z: pos.z - zoneSize },
      end: { x: pos.x + zoneSize, y: pos.y + zoneSize, z: pos.z + zoneSize },
      owner: player.name,
      coordinates: pos,
      createdAt: formatDateTime(new Date()),
      protectionEnabled: false,
      dimension: "minecraft:overworld",
      size: zoneSize,
      scanHeight: zoneSize,
      showBorderToOthers: false,
      bounceNonPlayers: false,
      visitMode: false,
    };

    const minDistanceBuffer = 20;
    const requiredDistance = fullSize + minDistanceBuffer;
    console.warn(
      `[DEBUG] minDistanceBuffer: ${minDistanceBuffer}, requiredDistance: ${requiredDistance}`
    );

    for (const [, existingZone] of protectionZones) {
      const exCenter = existingZone.coordinates;
      const distanceX = pos.x - exCenter.x;
      const distanceY = pos.y - exCenter.y;
      const distanceZ = pos.z - exCenter.z;
      const actualDistance = Math.sqrt(
        distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ
      );
      console.warn(
        `[DEBUG] Checking existing zone at x:${exCenter.x}, y:${exCenter.y}, z:${
          exCenter.z
        }, Actual distance: ${actualDistance.toFixed(2)} (required: ${requiredDistance})`
      );

      if (actualDistance < requiredDistance) {
        player.sendMessage(
          `§cเขตนี้ใกล้เขตอื่นเกินไป (ต้องห่างจากจุดกึ่งกลางอย่างน้อย ${requiredDistance} บล็อก)!`
        );
        console.warn(
          `[DEBUG] Zone creation failed for ${player.name} - Too close to existing zone at (${exCenter.x}, ${exCenter.y}, ${exCenter.z})`
        );
        return;
      }
    }

    protectionZones.set(player.name, newZone);
    saveZones();
    player.sendMessage(`§aสร้างเขตป้องกันขนาด ${fullSize}x${fullSize}x${fullSize} สำเร็จ!`);
    player.sendMessage(
      `§eเริ่มสแกนไฟในเขต ${fullSize}x${fullSize}x${fullSize} ที่ (${pos.x - zoneSize}, ${
        pos.y - zoneSize
      }, ${pos.z - zoneSize}) ถึง (${pos.x + zoneSize}, ${pos.y + zoneSize}, ${pos.z + zoneSize})`
    );
    console.warn(
      `[DEBUG] Zone created successfully for ${player.name} at (${pos.x}, ${pos.y}, ${pos.z})`
    );
  });
}

function deleteZone(player) {
  console.warn(`[DEBUG] deleteZone called for ${player.name}`);
  if (!protectionZones.has(player.name)) {
    player.sendMessage("§cคุณไม่มีเขตป้องกันให้ลบ!");
    console.warn(`[DEBUG] No zone found for ${player.name}`);
    return;
  }

  const confirmMenu = new ActionFormData()
    .title("ยืนยันการลบเขต")
    .body("คุณต้องการลบเขตป้องกันจริงๆ หรือไม่?")
    .button("ใช่ ลบเลย")
    .button("ไม่ ยกเลิก");

  confirmMenu.show(player).then((response) => {
    if (response.canceled || response.selection === 1) {
      player.sendMessage("§eยกเลิกการลบเขต!");
      console.warn(`[DEBUG] Zone deletion canceled by ${player.name}`);
      return;
    }

    scanProgress.delete(player.name);
    if (activeBorders.has(player.name)) {
      system.clearRun(activeBorders.get(player.name));
      activeBorders.delete(player.name);
      console.warn(`[DEBUG] Cleared border interval for ${player.name}`);
    }

    protectionZones.delete(player.name);
    allowedPlayers.delete(player.name);
    scanProgress.delete(player.name);
    saveZones();
    player.sendMessage("§aลบเขตป้องกันสำเร็จ!");
    console.warn(`[DEBUG] Zone deleted for ${player.name}`);
  });
}

/*----------------------------------------------------------------------------------------------------
 🌐 [Zone Border] 
----------------------------------------------------------------------------------------------------*/
function showZoneBorder(player) {
  console.warn(`[DEBUG] showZoneBorder called for ${player.name}`);
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณไม่มีเขตป้องกัน!");
    console.warn(`[DEBUG] No zone found for ${player.name}`);
    return;
  }

  const dimension = player.dimension;
  const { start, end } = zone;
  console.warn(
    `[DEBUG] Zone bounds - Start: (${start.x}, ${start.y}, ${start.z}), End: (${end.x}, ${end.y}, ${end.z})`
  );

  if (activeBorders.has(player.name)) {
    system.clearRun(activeBorders.get(player.name));
    activeBorders.delete(player.name);
    player.sendMessage("§eหยุดแสดงขอบเขตแล้ว!");
    console.warn(`[DEBUG] Stopped showing border for ${player.name}`);
    return;
  }

  const drawLine = (from, to, x, y, z) => {
    for (let i = from; i <= to; i++) {
      dimension.spawnParticle("minecraft:endrod", {
        x: x === null ? i + 0.5 : x + 0.5,
        y: y === null ? i + 0.5 : y + 0.5,
        z: z === null ? i + 0.5 : z + 0.5,
      });
    }
  };

  const center = {
    x: (start.x + end.x) / 2,
    z: (start.z + end.z) / 2,
  };
  const zoneSize = end.x - start.x;
  const maxDistance = zoneSize + 20;
  console.warn(
    `[DEBUG] Center: (${center.x}, ${center.z}), ZoneSize: ${zoneSize}, MaxDistance: ${maxDistance}`
  );

  function renderBorder() {
    if (!protectionZones.get(player.name)) {
      activeBorders.delete(player.name);
      player.sendMessage("§eหยุดแสดงขอบเขตเพราะเขตถูกลบ!");
      console.warn(`[DEBUG] Stopped border rendering - Zone deleted for ${player.name}`);
      return;
    }

    const { x, z } = player.location;
    const distance = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
    console.warn(
      `[DEBUG] Player position: (${x}, ${z}), Distance from center: ${distance.toFixed(
        2
      )} (max: ${maxDistance})`
    );

    if (distance > maxDistance) {
      const intervalId = activeBorders.get(player.name);
      if (intervalId !== undefined) {
        system.clearRun(intervalId);
        activeBorders.delete(player.name);
        player.sendMessage("§eหยุดแสดงขอบเขตเพราะคุณอยู่นอกระยะ!");
        console.warn(`[DEBUG] Stopped border rendering - Player ${player.name} out of range`);
      }
      return;
    }

    try {
      drawLine(start.x, end.x, null, start.y, start.z);
      drawLine(start.x, end.x, null, start.y, end.z);
      drawLine(start.z, end.z, start.x, start.y, null);
      drawLine(start.z, end.z, end.x, start.y, null);
      drawLine(start.x, end.x, null, end.y, start.z);
      drawLine(start.x, end.x, null, end.y, end.z);
      drawLine(start.z, end.z, start.x, end.y, null);
      drawLine(start.z, end.z, end.x, end.y, null);
      drawLine(start.y, end.y, start.x, null, start.z);
      drawLine(start.y, end.y, start.x, null, end.z);
      drawLine(start.y, end.y, end.x, null, start.z);
      drawLine(start.y, end.y, end.x, null, end.z);

      console.warn(`[DEBUG] Rendered border for ${player.name}`);
    } catch (e) {
      const intervalId = activeBorders.get(player.name);
      if (intervalId !== undefined) {
        system.clearRun(intervalId);
        activeBorders.delete(player.name);
        player.sendMessage("§eหยุดแสดงขอบเขตเพราะเขตอยู่นอกระยะที่โหลด!");
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn(`[DEBUG] เกิดข้อผิดพลาดในการแสดงขอบเขตสำหรับ ${player.name}: ${errorMessage}`);
      }
    }
  }

  const intervalId = system.runInterval(renderBorder, 30);
  activeBorders.set(player.name, intervalId);
  player.sendMessage("§aเริ่มแสดงขอบเขต! ใช้คำสั่งนี้อีกครั้งเพื่อหยุด.");
  console.warn(`[DEBUG] Started border rendering for ${player.name}, Interval ID: ${intervalId}`);
}

/*----------------------------------------------------------------------------------------------------
 🔄 [Game Loops] 
----------------------------------------------------------------------------------------------------*/
system.runInterval(() => {
  const dimension = world.getDimension("minecraft:overworld");
  const players = dimension.getPlayers();
  const onlineOwners = Array.from(protectionZones.keys()).filter((owner) =>
    players.some((p) => p.name === owner)
  );

  if (onlineOwners.length === 0) return;

  const maxBlocksPerTick = 1;

  for (const owner of onlineOwners) {
    const zone = protectionZones.get(owner);
    if (!zone || !zone.protectionEnabled || !zone.coordinates) continue;

    const { coordinates, size } = zone;
    let progress = scanProgress.get(owner) || {
      x: coordinates.x - size,
      y: coordinates.y - size,
      z: coordinates.z - size,
    };

    const blockPos = { x: progress.x, y: progress.y, z: progress.z };
    if (
      blockPos.x >= zone.start.x &&
      blockPos.x <= zone.end.x &&
      blockPos.y >= zone.start.y &&
      blockPos.y <= zone.end.y &&
      blockPos.z >= zone.start.z &&
      blockPos.z <= zone.end.z
    ) {
      fireCheckQueue.push(blockPos);
    }

    progress.x += 1;
    if (progress.x > coordinates.x + size) {
      progress.x = coordinates.x - size;
      progress.z += 1;
      if (progress.z > coordinates.z + size) {
        progress.z = coordinates.z - size;
        progress.y += 1;
        if (progress.y > coordinates.y + size) {
          progress.y = coordinates.y - size;
        }
      }
    }
    scanProgress.set(owner, progress);
  }

  if (fireCheckQueue.length > 1000) {
    fireCheckQueue.length = 0;
    for (const player of players) {
      if (onlineOwners.includes(player.name)) {
        player.sendMessage("§eคิวสแกนไฟถูกรีเซ็ตเนื่องจากเต็มเกิน 100 บล็อก!");
      }
    }
    console.warn(`[DEBUG] Fire check queue reset, exceeded 1000`);
  }

  const blocksToCheck = fireCheckQueue.splice(0, maxBlocksPerTick);

  for (const pos of blocksToCheck) {
    const block = dimension.getBlock(pos);
    if (block?.typeId === "minecraft:fire") {
      block.setType("minecraft:air");
      console.warn(`[DEBUG] Removed fire at (${pos.x}, ${pos.y}, ${pos.z})`);
    }
  }

  checkEntitiesInZone(players);
}, 20);

const notifiedPlayers = new Map();
const lastPositions = new Map();

function checkEntitiesInZone(players) {
  const currentTime = Date.now();
  const notificationCooldown = 30000;

  for (const player of players) {
    if (!player || !player.location) continue;

    const playerName = player.name;
    const currentPos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    };
    const lastPos = lastPositions.get(playerName);

    if (
      lastPos &&
      lastPos.x === currentPos.x &&
      lastPos.y === currentPos.y &&
      lastPos.z === currentPos.z
    ) {
      continue;
    }
    lastPositions.set(playerName, currentPos);

    const zones = isInsideZone(player.location);
    const playerData = notifiedPlayers.get(playerName) || { lastNotified: 0, wasInZone: false };
    const isInProtectedZone = zones.length > 0 && zones.some((z) => z.zone.protectionEnabled);

    if (isInProtectedZone) {
      const { owner, zone } = zones[0];
      const hasAccess = canAccess(player, owner);

      if (!hasAccess && currentTime - playerData.lastNotified >= notificationCooldown) {
        if (zone.visitMode) {
          player.sendMessage(`§eคุณอยู่ในโหมดเยี่ยมชมเขตของ ${owner}!`);
          console.warn(`[DEBUG] ${playerName} in visit mode for ${owner}'s zone`);
        } else {
          pushOutOfZone(player, zone);
          player.sendMessage(`§cคุณไม่มีสิทธิ์อยู่ในเขตของ ${owner}!`);
          logIntrusion(player, owner);
          console.warn(`[DEBUG] ${playerName} pushed out and logged intrusion in ${owner}'s zone`);
        }
        notifiedPlayers.set(playerName, { lastNotified: currentTime, wasInZone: true });
      } else if (hasAccess && playerData.wasInZone) {
        notifiedPlayers.delete(playerName);
        console.warn(`[DEBUG] Removed ${playerName} from notified players - Has access`);
      }
    } else if (playerData.wasInZone) {
      notifiedPlayers.delete(playerName);
      console.warn(`[DEBUG] Removed ${playerName} from notified players - Left zone`);
    }
  }
}

/*----------------------------------------------------------------------------------------------------
 ⚔️ [Entity Interaction Events] - การโต้ตอบกับเอนทิตี้ 
----------------------------------------------------------------------------------------------------*/
Minecraft.world.afterEvents.entityHitEntity.subscribe((event) => {
  const attacker = event.damagingEntity;
  const target = event.hitEntity; // เปลี่ยนจาก hurtEntity เป็น hitEntity

  if (!(attacker instanceof Minecraft.Player)) return;

  const zoneCheck = isWithinRequiredDistance(attacker.location);
  if (zoneCheck.isWithin && !canAccess(attacker, zoneCheck.owner)) {
    const health = target.getComponent("minecraft:health");
    if (health) health.setCurrentValue(health.effectiveMax);
    attacker.applyKnockback(0, 0, 0, 0.5);
    attacker.sendMessage("§cคุณไม่สามารถโจมตีในระยะเขตป้องกันนี้ได้!");
    console.warn(`[DEBUG] ป้องกันการโจมตีเอนทิตี้โดย ${attacker.name} - อยู่ในระยะที่จำกัด`);
    return;
  }
});

Minecraft.world.afterEvents.entityHurt.subscribe((event) => {
  const target = event.hurtEntity;
  if (!(target instanceof Minecraft.Player)) return;

  const zones = isInsideZone(target.location);
  if (zones.length === 0) return;

  const health = target.getComponent("minecraft:health");
  if (health) health.setCurrentValue(health.effectiveMax);
  target.addEffect("resistance", 60, { showParticles: false, amplifier: 255 });
  target.sendMessage("§eคุณอยู่ในเขตป้องกัน: อมตะ!");

  const attacker = event.damageSource.damagingEntity;
  if (attacker instanceof Minecraft.Player && !zones.some((z) => z.owner === attacker.name)) {
    const attackerHealth = attacker.getComponent("minecraft:health");
    if (attackerHealth) {
      attackerHealth.setCurrentValue(attackerHealth.currentValue - event.damage);
      attacker.applyKnockback(
        attacker.location.x - target.location.x,
        attacker.location.z - target.location.z,
        2,
        2
      );
      attacker.sendMessage("§cคุณโจมตีในเขตป้องกัน: ดาเมจสะท้อนและถูกดีด!");
    }
  }
});

Minecraft.world.afterEvents.entitySpawn.subscribe((event) => {
  console.warn(`[DEBUG] entitySpawn event triggered`);
  const entity = event.entity;
  if (!entity || !entity.location || !entity.typeId) {
    console.warn(`[DEBUG] Invalid entity spawn data`);
    return;
  }

  const zoneCheck = isWithinRequiredDistance(entity.location);

  if (!zoneCheck.isWithin) {
    return; // อนุญาตให้เอนทิตี้เกิดได้ตามปกติถ้าอยู่นอกระยะ
  }

  // ถ้าอยู่ในระยะ requiredDistance
  if (restrictedEntities.removeInstantly.includes(entity.typeId)) {
    entity.kill();
    console.warn(`[DEBUG] Killed restricted entity ${entity.typeId} in zone of ${zoneCheck.owner}`);
  }
});

/*----------------------------------------------------------------------------------------------------
 ⚔️ [Block Interaction Events] - การโต้ตอบกับบล็อก 
----------------------------------------------------------------------------------------------------*/
Minecraft.world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const player = event.player;

  // ตรวจสอบว่าอยู่ในระยะเขตแดนหรือไม่
  const zoneCheck = isWithinRequiredDistance(event.block.location);
  if (zoneCheck.isWithin) {
    // ถ้าอยู่ในระยะเขตแดนและไม่มีสิทธิ์เข้าถึง
    if (!canAccess(player, zoneCheck.owner)) {
      event.cancel = true;
      player.sendMessage("§cคุณไม่สามารถขุดบล็อกในระยะเขตป้องกันนี้ได้!");
      console.warn(
        `[DEBUG] ยกเลิกการขุดบล็อกโดย ${player.name} - อยู่ในระยะเขตป้องกันของ ${zoneCheck.owner}`
      );
      return;
    }
  }
  // ถ้าอยู่นอกระยะเขตแดน อนุญาตให้ขุดได้ตามปกติ
});

Minecraft.world.beforeEvents.playerPlaceBlock.subscribe((event) => {
  const player = event.player;
  const blockType = event.block.typeId;

  // ตรวจสอบว่าอยู่ในระยะเขตแดนหรือไม่
  const zoneCheck = isWithinRequiredDistance(event.block.location);
  if (zoneCheck.isWithin) {
    // ถ้าอยู่ในระยะเขตแดนและบล็อกอยู่ใน restrictedBlocks และไม่มีสิทธิ์เข้าถึง
    if (restrictedBlocks.has(blockType) && !canAccess(player, zoneCheck.owner)) {
      event.cancel = true;
      player.sendMessage("§cคุณไม่สามารถวางบล็อกที่ถูกจำกัดในระยะเขตป้องกันนี้ได้!");
      console.warn(
        `[DEBUG] ยกเลิกการวางบล็อกที่ถูกจำกัดโดย ${player.name} - อยู่ในระยะเขตป้องกันของ ${zoneCheck.owner}`
      );
      return;
    }
  }
  // ถ้าอยู่นอกระยะเขตแดน อนุญาตให้วางบล็อกได้ตามปกติ
});

Minecraft.world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, player } = event;
  const blockType = block.typeId;
  const zones = isInsideZone(block.location);

  console.warn(
    `[DEBUG] Player ${player.name} interacted with block at (${block.location.x}, ${block.location.y}, ${block.location.z}), Zones: ${zones.length}, BlockType: ${blockType}`
  );
  if (zones.length > 0 && zones.some((z) => z.zone.protectionEnabled)) {
    const hasAccess = zones.some((z) => canAccess(player, z.owner));
    if (!hasAccess) {
      event.cancel = true;
      player.sendMessage("§cคุณไม่มีสิทธิ์โต้ตอบกับบล็อกในเขตนี้!");
      console.warn(
        `[DEBUG] Cancelled block interaction by ${player.name} - No access in protected zone`
      );
      return;
    }
  }
});

/*----------------------------------------------------------------------------------------------------
 ⚔️ [Item Usage Events] - การใช้ไอเทม 
----------------------------------------------------------------------------------------------------*/
Minecraft.world.beforeEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const item = event.itemStack;

  if (!player || !player.location || !player.name || !item || !item.typeId) {
    console.warn(`[DEBUG] Invalid item use data`);
    return;
  }

  const zoneCheck = isWithinRequiredDistance(player.location);
  if (zoneCheck.isWithin && !canAccess(player, zoneCheck.owner)) {
    event.cancel = true;
    player.sendMessage("§cคุณไม่สามารถใช้ไอเทมในระยะเขตป้องกันนี้ได้!");
    console.warn(`[DEBUG] Cancelled item use by ${player.name} - Within restricted distance`);
    return;
  }
  // ถ้าอยู่นอกระยะ requiredDistance อนุญาตให้ใช้ไอเทมได้ตามปกติ
});

Minecraft.world.beforeEvents.itemUseOn.subscribe((event) => {
  const player = event.source;
  const block = event.block;
  const item = event.itemStack;

  if (!player || !player.name || !block || !block.location || !item) {
    console.warn(`[DEBUG] Invalid item use on data`);
    return;
  }

  const zoneCheck = isWithinRequiredDistance(block.location);
  console.warn(
    `[DEBUG] Player ${player.name} used item ${item.typeId} on block at (${block.location.x}, ${block.location.y}, ${block.location.z}), InZone: ${zoneCheck.isWithin}`
  );

  if (zoneCheck.isWithin && !canAccess(player, zoneCheck.owner)) {
    event.cancel = true;
    player.sendMessage("§cคุณไม่สามารถโต้ตอบกับบล็อกในระยะเขตป้องกันนี้ได้!");
    console.warn(
      `[DEBUG] Cancelled item use on block by ${player.name} - Within restricted distance`
    );
    return;
  }
  // ถ้าอยู่นอกระยะ requiredDistance อนุญาตให้โต้ตอบได้ตามปกติ
});

/*----------------------------------------------------------------------------------------------------
 ⚔️ [Command Events] - การใช้คำสั่ง 
----------------------------------------------------------------------------------------------------*/
Minecraft.world.beforeEvents.chatSend.subscribe((event) => {
  const player = event.sender;
  const message = event.message;

  if (!player || !player.location || !player.name || !message) {
    console.warn(`[DEBUG] Invalid chat send data`);
    return;
  }

  if (
    (message.includes("/setblock") && message.includes("tnt")) ||
    (message.includes("/fill") && message.includes("tnt"))
  ) {
    const zoneCheck = isWithinRequiredDistance(player.location);
    if (zoneCheck.isWithin && !canAccess(player, zoneCheck.owner)) {
      event.cancel = true;
      player.sendMessage(`§cไม่อนุญาตให้ใช้คำสั่งวาง TNT ในระยะเขตของ ${zoneCheck.owner}!`);
      console.warn(`[DEBUG] Cancelled TNT command by ${player.name} - Within restricted distance`);
    }
    // ถ้าอยู่นอกระยะ requiredDistance อนุญาตให้ใช้คำสั่งได้ตามปกติ
  }
});

/*----------------------------------------------------------------------------------------------------
 🔐 [Protection Toggle] 
----------------------------------------------------------------------------------------------------*/
function toggleProtection(player) {
  console.warn(`[DEBUG] toggleProtection called for ${player.name}`);
  const zone = protectionZones.get(player.name);
  if (!zone) {
    player.sendMessage("§cคุณยังไม่มีเขตป้องกัน!");
    console.warn(`[DEBUG] No zone found for ${player.name}`);
    return;
  }

  zone.protectionEnabled = !zone.protectionEnabled;
  protectionZones.set(player.name, zone);
  saveZones();
  player.sendMessage(
    zone.protectionEnabled
      ? "§aเปิดระบบป้องกันเต็มรูปแบบในเขตแล้ว! (ห้ามโจมตี, ใช้ไอเทม, หรือโต้ตอบ)"
      : "§cปิดระบบป้องกันในเขตแล้ว!"
  );
  console.warn(`[DEBUG] ProtectionEnabled set to ${zone.protectionEnabled} for ${player.name}`);
}

/*----------------------------------------------------------------------------------------------------
 📜 [Intrusion Logging] 
----------------------------------------------------------------------------------------------------*/
function logIntrusion(player, zoneOwner) {
  console.warn(`[DEBUG] logIntrusion called - Intruder: ${player.name}, ZoneOwner: ${zoneOwner}`);
  const timestamp = formatDateTime(new Date());
  const logEntry = {
    intruder: player.name,
    zoneOwner: zoneOwner,
    timestamp: timestamp,
    location: {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    },
  };
  console.warn(`[DEBUG] Log entry created: ${JSON.stringify(logEntry)}`);

  const logs = intrusionLog.get(zoneOwner) || [];
  if (logs.length >= 100) {
    logs.shift();
    console.warn(`[DEBUG] Removed oldest intrusion log for ${zoneOwner}, Max 100 reached`);
  }
  logs.push(logEntry);
  intrusionLog.set(zoneOwner, logs);
  saveZones();
  console.warn(`[DEBUG] Added intrusion log for ${zoneOwner}, Total logs: ${logs.length}`);
}
