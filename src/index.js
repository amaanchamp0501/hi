require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const db = require("./db");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const EVENT_TYPES = ["HICOM","Leadership","OA","REC","Tryout","CT","FT","PT","Raid","Other"];

function isStaff(i) {
  if (i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return config.staffRoleIds.some(id => i.member?.roles?.cache?.has(id));
}
function highestConfiguredRole(member) {
  for (const req of config.roleRequirements) {
    if (member.roles.cache.some(r => r.name.toLowerCase() === req.name.toLowerCase())) return req;
  }
  return null;
}
function countReq(req, userId) {
  const events = [...db.getEventsForUser(userId), ...db.getCohostEventsForUser(userId)];
  if (req.type === "event") return events.filter(e => req.eventTypes.includes(e.event_type)).length;
  if (req.type === "duty") return db.getDutiesForUser(userId).filter(d => req.dutyTypes.includes(d.duty_type)).length;
  if (req.type === "reform") return db.getReformsForUser(userId).length;
  if (req.type === "department") return db.getDepartmentsForUser(userId).length;
  return 0;
}
function quotaEmbed(member) {
  const roleReq = highestConfiguredRole(member);
  const embed = new EmbedBuilder().setTitle(`Crimson Imperium Weekly Quota — ${member.displayName}`).setTimestamp();
  if (!roleReq) return embed.setDescription("No configured quota role was found for this member.");
  return embed.setDescription(`**Role:** ${roleReq.name}\n\n${roleReq.requirements.map(r => {
    const count = countReq(r, member.id);
    return `${count >= r.target ? "✅" : "❌"} **${r.label}:** ${count}/${r.target}`;
  }).join("\n")}`);
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
      .addSubcommand(s => s.setName("cancel").setDescription("Cancel a recorded event").addIntegerOption(o => o.setName("id").setDescription("Event ID").setRequired(true))),
    new SlashCommandBuilder().setName("quota").setDescription("View or manage weekly quotas")
      .addSubcommand(s => s.setName("view").setDescription("View a member's quota").addUserOption(o => o.setName("user").setDescription("Member")))
      .addSubcommand(s => s.setName("all").setDescription("View everyone with a configured quota role"))
      .addSubcommand(s => s.setName("reset").setDescription("Archive the current week and start a new week"))
      .addSubcommand(s => s.setName("export").setDescription("Show the current week's event records")),
    new SlashCommandBuilder().setName("duty").setDescription("Record a quota duty").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o => o.setName("type").setDescription("Duty type").setRequired(true).addChoices({name:"Leadership",value:"Leadership"},{name:"HICOM",value:"HICOM"})).addStringOption(o => o.setName("notes").setDescription("Notes")),
    new SlashCommandBuilder().setName("reform").setDescription("Record a HICOM reform").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o => o.setName("type").setDescription("Reform type").setRequired(true)).addStringOption(o => o.setName("notes").setDescription("Notes")),
    new SlashCommandBuilder().setName("department").setDescription("Record a department join").addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)).addStringOption(o => o.setName("name").setDescription("Department name"))
  ].map(c => c.toJSON());
  const rest = new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID), {body:commands});
}
client.once("ready", async () => { await registerCommands(); console.log(`Logged in as ${client.user.tag}`); });
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === "event") {
      const sub = i.options.getSubcommand();
      if (sub === "create") {
        if (!isStaff(i)) return i.reply({content:"You do not have permission to create quota events.",ephemeral:true});
        const channel=i.options.getChannel("channel"), host=i.options.getMember("host"), cohost=i.options.getMember("cohost"), supervisor=i.options.getMember("supervisor");
        const type=i.options.getString("type"), name=i.options.getString("name");
        const eligibleCohost = cohost?.id || null;
        const event=db.createEvent({hostId:host.id,cohostId:eligibleCohost,supervisorId:supervisor?.id,eventType:type,eventName:name,channelId:channel.id,createdBy:i.user.id});
        const embed=new EmbedBuilder().setTitle(`Crimson Imperium — ${name}`).setDescription(`**Event Type:** ${type}\n**Host:** <@${host.id}>\n**Co-Host:** ${cohost ? `<@${cohost.id}>` : "None"}\n**Supervisor:** ${supervisor ? `<@${supervisor.id}>` : "None"}\n\n**Event ID:** \`#${event.id}\`\nThis event has been recorded for the weekly quota.`).setFooter({text:"Crimson Imperium Event System"}).setTimestamp();
        await channel.send({embeds:[embed]});
        return i.reply({content:`Event **#${event.id}** announced in ${channel}. Host credit recorded.${cohost ? " Co-host credit recorded." : ""}`,ephemeral:true});
      }
      if (sub === "cancel") {
        if (!isStaff(i)) return i.reply({content:"You do not have permission to cancel events.",ephemeral:true});
        const ok=db.cancelEvent(i.options.getInteger("id"));
        return i.reply({content:ok ? "Event cancelled and removed from active quota totals." : "Event not found or already cancelled.",ephemeral:true});
      }
    }
    if (i.commandName === "quota") {
      const sub=i.options.getSubcommand();
      if (sub==="view") return i.reply({embeds:[quotaEmbed(i.options.getMember("user")||i.member)]});
      if (sub==="all") {
        const members=await i.guild.members.fetch();
        const rows=members.filter(m=>highestConfiguredRole(m)).map(m=>{const r=highestConfiguredRole(m);const done=r.requirements.every(x=>countReq(x,m.id)>=x.target);return `${done?"✅":"❌"} <@${m.id}> — **${r.name}**`;});
        return i.reply({content:rows.length?rows.join("\n").slice(0,1900):"No configured quota members found."});
      }
      if (sub==="reset") {
        if (!isStaff(i)) return i.reply({content:"You do not have permission to reset quotas.",ephemeral:true});
        const x=db.archiveAndReset(); return i.reply({content:`Week **#${x.archivedWeek.id}** archived. New quota week **#${x.newWeek.id}** has started at zero.`});
      }
      if (sub==="export") {
        if (!isStaff(i)) return i.reply({content:"You do not have permission to export quota data.",ephemeral:true});
        const rows=db.getAllEvents(); const text=rows.length?rows.map(e=>`#${e.id} | <@${e.discord_user_id}> | ${e.event_type} | ${e.event_name||"Unnamed"} | cohost: ${e.cohost_user_id?"<@"+e.cohost_user_id+">":"-"} | ${e.created_at}`).join("\n"):"No events recorded this week.";
        return i.reply({content:(`**Current Week Event Export**\n${text}`).slice(0,1950),ephemeral:true});
      }
    }
    if (["duty","reform","department"].includes(i.commandName)) {
      if (!isStaff(i)) return i.reply({content:"You do not have permission to record quota data.",ephemeral:true});
      const u=i.options.getMember("user");
      if(i.commandName==="duty") db.addDuty(u.id,i.options.getString("type"),i.options.getString("notes"),i.user.id);
      if(i.commandName==="reform") db.addReform(u.id,i.options.getString("type"),i.options.getString("notes"),i.user.id);
      if(i.commandName==="department") db.addDepartment(u.id,i.options.getString("name"),i.user.id);
      return i.reply({content:`Recorded ${i.commandName} credit for <@${u.id}>.`,ephemeral:true});
    }
  } catch(e) { console.error(e); if(!i.replied) await i.reply({content:"An error occurred while processing that command.",ephemeral:true}); }
});
client.login(process.env.DISCORD_TOKEN);
