require("dotenv").config();
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits
} = require("discord.js");
const config = require("./config");
const db = require("./db");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const EVENT_TYPES = ["HICOM","Leadership","OA","REC","Tryout","CT","FT","PT","Raid","Other"];

function isStaff(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return config.staffRoleIds.some(id => interaction.member?.roles?.cache?.has(id));
}

function highestConfiguredRole(member) {
  for (const req of config.roleRequirements) {
    if (member.roles.cache.some(r => r.name.toLowerCase() === req.name.toLowerCase())) return req;
  }
  return null;
}

function countReq(req, userId) {
  const events = db.getEventsForUser(userId);
  const cohostEvents = db.getCohostEventsForUser(userId);
  const allEvents = [...events, ...cohostEvents];
  if (req.type === "event") return allEvents.filter(e => req.eventTypes.includes(e.event_type)).length;
  if (req.type === "duty") return db.getDutiesForUser(userId).filter(d => req.dutyTypes.includes(d.duty_type)).length;
  if (req.type === "reform") return db.getReformsForUser(userId).length;
  if (req.type === "department") return db.getDepartmentsForUser(userId).length;
  return 0;
}

function quotaEmbed(member) {
  const roleReq = highestConfiguredRole(member);
  const embed = new EmbedBuilder().setTitle(`Crimson Imperium Weekly Quota — ${member.displayName}`).setTimestamp();
  if (!roleReq) {
    return embed.setDescription("No configured quota role was found for this member.");
  }
  const lines = roleReq.requirements.map(r => {
    const count = countReq(r, member.id);
    const done = count >= r.target ? "✅" : "❌";
    return `${done} **${r.label}:** ${count}/${r.target}`;
  });
  return embed.setDescription(`**Role:** ${roleReq.name}\n\n${lines.join("\n")}`);
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName("event").setDescription("Create and manage CR events")
      .addSubcommand(s => s.setName("create").setDescription("Post an event announcement and record it for quota")
        .addStringOption(o => o.setName("type").setDescription("Quota event type").setRequired(true).addChoices(...EVENT_TYPES.map(x => ({name:x,value:x}))))
        .addStringOption(o => o.setName("name").setDescription("Event name").setRequired(true))
        .addUserOption(o => o.setName("host").setDescription("Event host").setRequired(true))
        .addUserOption(o => o.setName("cohost").setDescription("Optional co-host"))
        .addUserOption(o => o.setName("supervisor").setDescription("Optional supervisor"))
        .addChannelOption(o => o.setName("channel").setDescription("Announcement channel").setRequired(true)))
      .addSubcommand(s => s.setName("cancel").setDescription("Cancel a recorded event")
        .addIntegerOption(o => o.setName("id").setDescription("Event ID").setRequired(true))),
    new SlashCommandBuilder().setName("quota").setDescription("View or manage weekly quotas")
      .addSubcommand(s => s.setName("view").setDescription("View a member's quota").addUserOption(o => o.setName("user").setDescription("Member")))
      .addSubcommand(s => s.setName("all").setDescription("View everyone with a configured quota role"))
      .addSubcommand(s => s.setName("reset").setDescription("Archive the current week and start a new week"))
      .addSubcommand(s => s.setName("export").setDescription("Show the current week's event records")),
    new SlashCommandBuilder().setName("duty").setDescription("Record a quota duty")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("type").setDescription("Duty type").setRequired(true).addChoices({name:"Leadership",value:"Leadership"},{name:"HICOM",value:"HICOM"}))
      .addStringOption(o => o.setName("notes").setDescription("Notes")),
    new SlashCommandBuilder().setName("reform").setDescription("Record a HICOM reform")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("type").setDescription("Reform type").setRequired(true))
      .addStringOption(o => o.setName("notes").setDescription("Notes")),
    new SlashCommandBuilder().setName("department").setDescription("Record a department join")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
      .addStringOption(o => o.setName("name").setDescription("Department name"))
  ].map(c => c.toJSON());

  const rest = new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    {body: commands}
  );
}

client.once("ready", async () => {
  await registerCommands();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "event") {
      const sub = interaction.options.getSubcommand();

      if (sub === "create") {
        if (!isStaff(interaction)) return interaction.reply({content:"You do not have permission to create quota events.", ephemeral:true});

        const channel = interaction.options.getChannel("channel");
        const host = interaction.options.getMember("host");
        const cohost = interaction.options.getMember("cohost");
        const supervisor = interaction.options.getMember("supervisor");
        const type = interaction.options.getString("type");
        const name = interaction.options.getString("name");

        const event = db.createEvent({
          hostId: host.id, cohostId: cohost?.id, supervisorId: supervisor?.id,
          eventType: type, eventName: name, channelId: channel.id,
          createdBy: interaction.user.id
        });

        const embed = new EmbedBuilder()
          .setTitle(`Crimson Imperium — ${name}`)
          .setDescription(`**Event Type:** ${type}\n**Host:** <@${host.id}>\n**Co-Host:** ${cohost ? `<@${cohost.id}>` : "None"}\n**Supervisor:** ${supervisor ? `<@${supervisor.id}>` : "None"}\n\n**Event ID:** \`#${event.id}\`\nThis event has been recorded for the weekly quota.`)
          .setFooter({text:"Crimson Imperium Event System"}).setTimestamp();

        await channel.send({embeds:[embed]});
        return interaction.reply({content:`Event **#${event.id}** announced in ${channel}. The host has been credited automatically.${cohost ? " Co-host credit applies only when the co-host has the configured co-host quota role." : ""}`, ephemeral:true});
      }

      if (sub === "cancel") {
        if (!isStaff(interaction)) return interaction.reply({content:"You do not have permission to cancel events.", ephemeral:true});
        const id = interaction.options.getInteger("id");
        const ok = db.cancelEvent(id);
        return interaction.reply({content: ok ? `Event **#${id}** cancelled and removed from active quota totals.` : "Event not found or already cancelled.", ephemeral:true});
      }
    }

    if (interaction.commandName === "quota") {
      const sub = interaction.options.getSubcommand();
      if (sub === "view") {
        const member = interaction.options.getMember("user") || interaction.member;
        return interaction.reply({embeds:[quotaEmbed(member)]});
      }

      if (sub === "all") {
        const members = await interaction.guild.members.fetch();
        const rows = members.filter(m => highestConfiguredRole(m)).map(m => {
          const req = highestConfiguredRole(m);
          const done = req.requirements.every(r => countReq(r,m.id) >= r.target);
          return `${done ? "✅" : "❌"} <@${m.id}> — **${req.name}**`;
        });
        return interaction.reply({content: rows.length ? rows.join("\n").slice(0,1900) : "No configured quota members found."});
      }

      if (sub === "reset") {
        if (!isStaff(interaction)) return interaction.reply({content:"You do not have permission to reset quotas.", ephemeral:true});
        const result = db.archiveAndReset();
        return interaction.reply({content:`Week **#${result.archivedWeek.id}** archived. New quota week **#${result.newWeek.id}** has started at zero.`});
      }

      if (sub === "export") {
        if (!isStaff(interaction)) return interaction.reply({content:"You do not have permission to export quota data.", ephemeral:true});
        const events = db.getAllEvents();
        const text = events.length
          ? events.map(e => `#${e.id} | <@${e.discord_user_id}> | ${e.event_type} | ${e.event_name || "Unnamed"} | cohost: ${e.cohost_user_id ? "<@" + e.cohost_user_id + ">" : "-"} | ${e.created_at}`).join("\n")
          : "No events recorded this week.";
        return interaction.reply({content:(`**Current Week Event Export**\n${text}`).slice(0,1950), ephemeral:true});
      }
    }

    if (["duty","reform","department"].includes(interaction.commandName)) {
      if (!isStaff(interaction)) return interaction.reply({content:"You do not have permission to record quota data.", ephemeral:true});
      const user = interaction.options.getMember("user");
      if (interaction.commandName === "duty") db.addDuty(user.id, interaction.options.getString("type"), interaction.options.getString("notes"), interaction.user.id);
      if (interaction.commandName === "reform") db.addReform(user.id, interaction.options.getString("type"), interaction.options.getString("notes"), interaction.user.id);
      if (interaction.commandName === "department") db.addDepartment(user.id, interaction.options.getString("name"), interaction.user.id);
      return interaction.reply({content:`Recorded ${interaction.commandName} credit for <@${user.id}>.`, ephemeral:true});
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied) await interaction.reply({content:"An error occurred while processing that command.", ephemeral:true});
  }
});

client.login(process.env.DISCORD_TOKEN);
