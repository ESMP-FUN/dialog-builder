/*
 * Which items the preview can draw a real texture for.
 *
 * Textures are 16x16 PNGs from Mojang's bedrock-samples resource pack, saved
 * under assets/icons/ named by their *Java* item id — Bedrock names several
 * things differently (apple_golden, compass_item, redstone_dust), so the
 * rename happens once, here, at download time rather than at runtime.
 *
 * Anything not in this list falls back to a lettered placeholder, which is
 * fine: the builder is about layout, not about owning every texture.
 */
(function (global) {
  'use strict';

  var AVAILABLE = [
    "amethyst_shard", "apple", "arrow", "beacon", "bedrock", "blaze_powder",
    "blaze_rod", "bone", "book", "bookshelf", "bow", "bread",
    "brick", "bricks", "bucket", "charcoal", "clay", "clock",
    "coal", "coal_block", "coal_ore", "cobblestone", "compass", "cooked_beef",
    "cookie", "copper_ingot", "crafting_table", "diamond", "diamond_axe", "diamond_block",
    "diamond_chestplate", "diamond_helmet", "diamond_hoe", "diamond_ore", "diamond_pickaxe", "diamond_sword",
    "dirt", "dragon_breath", "echo_shard", "elytra", "emerald", "emerald_block",
    "emerald_ore", "enchanted_book", "enchanted_golden_apple", "end_stone", "ender_eye", "ender_pearl",
    "experience_bottle", "feather", "fishing_rod", "flint_and_steel", "furnace", "glass",
    "glowstone", "glowstone_dust", "gold_block", "gold_ingot", "gold_ore", "golden_apple",
    "golden_pickaxe", "gravel", "gunpowder", "hay_block", "honeycomb", "ice",
    "iron_block", "iron_ingot", "iron_ore", "iron_pickaxe", "lapis_block", "lapis_ore",
    "leather", "map", "melon", "name_tag", "nautilus_shell", "nether_brick",
    "nether_star", "netherite_ingot", "netherite_pickaxe", "netherite_scrap", "netherite_sword", "netherrack",
    "oak_planks", "obsidian", "ominous_trial_key", "paper", "pumpkin", "quartz",
    "redstone", "redstone_block", "redstone_ore", "saddle", "sand", "sea_lantern",
    "shears", "slime_ball", "snow_block", "soul_sand", "sponge", "stick",
    "stone", "tnt", "totem_of_undying", "trial_key", "water_bucket", "wheat",
    "writable_book", "written_book"
  ];

  var SET = {};
  AVAILABLE.forEach(function (id) { SET[id] = true; });

  function iconFor(itemId) {
    var short = String(itemId || '').replace(/^.*:/, '');
    return SET[short] ? 'assets/icons/' + short + '.png' : null;
  }

  global.Icons = { list: AVAILABLE, iconFor: iconFor };
})(window);
