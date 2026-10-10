require("dotenv").config();
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,EmbedBuilder,PermissionFlagsBits,ActionRowBuilder,ButtonBuilder,ButtonStyle,AttachmentBuilder}=require("discord.js");
const db=require("./db");
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const canManage=i=>i.memberPermissions?.has(PermissionFlagsBits.Administrator)||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
const setupCommand=new SlashCommandBuilder().setName("setup").setDescription("Configure this server's event system")
 .addSubcommand(s=>s.setName("host-role").setDescription("Choose which role may host events").addRoleOption(o=>o.setName("role").setDescription("Allowed host role").setRequired(true)))
 .addSubcommand(s=>s.setName("announcement-channel").setDescription("Set the default announcement channel").addChannelOption(o=>o.setName("channel").setDescription("Announcement channel").setRequired(true)))
 .addSubcommand(s=>s.setName("reset-days").setDescription("Set how often quota resets").addIntegerOption(o=>o.setName("days").setDescription("Days between resets (1-30)").setMinValue(1).setMaxValue(30).setRequired(true)));
const eventCommand=new SlashCommandBuilder().setName("event").setDescription("Create and manage events")
 .addSubcommand(s=>s.setName("create").setDescription("Create an event announcement").addStringOption(o=>o.setName("name").setDescription("Event name").setMaxLength(100).setRequired(true)).addStringOption(o=>o.setName("description").setDescription("Announcement details").setMaxLength(1500)).addUserOption(o=>o.setName("host").setDescription("Host (defaults to you)")).addUserOption(o=>o.setName("cohost").setDescription("Optional co-host")).addUserOption(o=>o.setName("supervisor").setDescription("Optional supervisor")).addChannelOption(o=>o.setName("channel").setDescription("Override announcement channel")))
 .addSubcommand(s=>s.setName("lock").setDescription("Lock an event").addIntegerOption(o=>o.setName("id").setDescription("Event ID").setRequired(true)))
 .addSubcommand(s=>s.setName("unlock").setDescription("Unlock an event").addIntegerOption(o=>o.setName("id").setDescription("Event ID").setRequired(true)));
const quotaCommand=new SlashCommandBuilder().setName("quota").setDescription("View and manage event-hosting quota")
 .addSubcommand(s=>s.setName("view").setDescription("View your or another member's hosted-event quota").addUserOption(o=>o.setName("user").setDescription("Member")))
 .addSubcommand(s=>s.setName("all").setDescription("Export this week's host/co-host event totals as CSV"))
 .addSubcommand(s=>s.setName("reset").setDescription("Reset this server's quota now"));
async function register(){const rest=new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),{body:[setupCommand.toJSON(),eventCommand.toJSON(),quotaCommand.toJSON()]});}
function authorizedHost(i,settings){return canManage(i)||!!settings.host_role_id&&i.member.roles.cache.has(settings.host_role_id);}
function announcement(e){return new EmbedBuilder().setColor(0x8b1e2d).setTitle("📣 "+e.name).setDescription(e.description||"Event announcement").addFields({name:"Host",value:"<@"+e.host_id+">",inline:true},{name:"Co-host",value:e.cohost_id?"<@"+e.cohost_id+">":"Not assigned",inline:true},{name:"Supervisor",value:e.supervisor_id?"<@"+e.supervisor_id+">":"Not assigned",inline:true},{name:"Event ID",value:"#"+e.id,inline:true},{name:"Status",value:e.locked?"🔒 Locked":"🟢 Open",inline:true}).setFooter({text:"Event Host • Join below; host and co-host receive quota credit"}).setTimestamp(new Date(e.created_at));}
function buttons(e){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("event_join_"+e.id).setLabel("Join Event").setEmoji("🙋").setStyle(ButtonStyle.Success).setDisabled(!!e.locked||!!e.cancelled),new ButtonBuilder().setCustomId("event_lock_"+e.id).setLabel(e.locked?"Event Locked":"Lock Event").setEmoji("🔒").setStyle(ButtonStyle.Secondary).setDisabled(!!e.locked||!!e.cancelled));}
async function refreshAnnouncement(guild,e){if(!e.message_id)return;const ch=await guild.channels.fetch(e.channel_id).catch(()=>null);if(!ch?.isTextBased())return;const msg=await ch.messages.fetch(e.message_id).catch(()=>null);if(msg)await msg.edit({embeds:[announcement(e)],components:[buttons(e)]});}
client.once("ready",async()=>{try{await register();console.log("Event Host online as "+client.user.tag);}catch(e){console.error("Command registration failed:",e);}setInterval(()=>{for(const s of db.dueResets())db.resetGuild(s.guild_id);},60000);});
client.on("guildCreate",g=>db.ensureGuild(g.id));
client.on("interactionCreate",async i=>{
 try{
  if(i.isButton()){
   const parts=i.customId.split("_"),kind=parts[1],eventId=Number(parts[2]),e=db.getEvent(eventId);
   if(!e||e.guild_id!==i.guildId)return i.reply({content:"This event could not be found in this server.",ephemeral:true});
   if(kind==="join"){const ok=db.joinEvent(eventId,i.user.id);return i.reply({content:ok?"You're on the attendee list!":"This event is locked or you already joined.",ephemeral:true});}
   if(kind==="lock"){if(!canManage(i)&&e.host_id!==i.user.id&&e.cohost_id!==i.user.id)return i.reply({content:"Only the event host, co-host, or a server manager can lock this event.",ephemeral:true});db.toggleLock(eventId,true);return i.update({embeds:[announcement(db.getEvent(eventId))],components:[buttons(db.getEvent(eventId))]});}
  }
  if(!i.isChatInputCommand()||!i.guildId)return;
  const settings=db.ensureGuild(i.guildId);
  if(i.commandName==="setup"){
   if(!canManage(i))return i.reply({content:"You need Manage Server or Administrator to configure this bot.",ephemeral:true});
   const sub=i.options.getSubcommand();
   if(sub==="host-role"){db.setSetting(i.guildId,"host_role_id",i.options.getRole("role").id);return i.reply({content:"Allowed event-host role saved for this server.",ephemeral:true});}
   if(sub==="announcement-channel"){db.setSetting(i.guildId,"announcement_channel_id",i.options.getChannel("channel").id);return i.reply({content:"Default announcement channel saved for this server.",ephemeral:true});}
   if(sub==="reset-days"){const days=i.options.getInteger("days");db.setSetting(i.guildId,"reset_days",days);db.setSetting(i.guildId,"next_reset_at",new Date(Date.now()+days*86400000).toISOString());return i.reply({content:"Quota reset interval set to every "+days+" day(s).",ephemeral:true});}
  }
  if(i.commandName==="event"){
   const sub=i.options.getSubcommand();
   if(sub==="create"){
    if(!authorizedHost(i,settings))return i.reply({content:"You are not allowed to host events. Ask an administrator to configure the host role with /setup host-role.",ephemeral:true});
    const host=i.options.getMember("host")||i.member,cohost=i.options.getMember("cohost"),supervisor=i.options.getMember("supervisor");
    const channel=i.options.getChannel("channel")||(settings.announcement_channel_id?await i.guild.channels.fetch(settings.announcement_channel_id).catch(()=>null):i.channel);
    if(!channel?.isTextBased())return i.reply({content:"Set a text announcement channel using /setup announcement-channel, or choose a channel in this command.",ephemeral:true});
    const e=db.createEvent({guildId:i.guildId,hostId:host.id,cohostId:cohost?.id,supervisorId:supervisor?.id,name:i.options.getString("name"),description:i.options.getString("description"),channelId:channel.id});
    const msg=await channel.send({embeds:[announcement(e)],components:[buttons(e)]});db.setMessage(e.id,msg.id);
    return i.reply({content:"Event **#"+e.id+"** announced in "+channel+". Host"+(cohost?" and co-host":"")+" receive quota credit; supervisor does not.",ephemeral:true});
   }
   if(sub==="lock"||sub==="unlock"){
    const e=db.getEvent(i.options.getInteger("id"));if(!e||e.guild_id!==i.guildId)return i.reply({content:"Event not found in this server.",ephemeral:true});
    if(!canManage(i)&&(sub==="unlock"||e.host_id!==i.user.id&&e.cohost_id!==i.user.id))return i.reply({content:"Only the event host/co-host can lock it; only server managers can unlock it.",ephemeral:true});
    db.toggleLock(e.id,sub==="lock");await refreshAnnouncement(i.guild,db.getEvent(e.id));return i.reply({content:"Event #"+e.id+(sub==="lock"?" locked.":" unlocked."),ephemeral:true});
   }
  }
  if(i.commandName==="quota"){
   const sub=i.options.getSubcommand();
   if(sub==="view"){const user=i.options.getUser("user")||i.user;return i.reply({content:"**Event quota — "+user.username+"**\nHosted/co-hosted events this period: **"+db.getQuota(i.guildId,user.id)+"**",ephemeral:true});}
   if(sub==="all"){
    if(!canManage(i))return i.reply({content:"Only server managers can export quota totals.",ephemeral:true});
    const totals=new Map();for(const e of db.getEvents(i.guildId)){totals.set(e.host_id,(totals.get(e.host_id)||0)+1);if(e.cohost_id)totals.set(e.cohost_id,(totals.get(e.cohost_id)||0)+1);}
    const csv="Discord User ID,Events Hosted or Co-hosted\n"+[...totals].map(([id,n])=>id+","+n).join("\n");
    return i.reply({files:[new AttachmentBuilder(Buffer.from(csv,"utf8"),{name:"weekly-event-quota.csv"})],ephemeral:true});
   }
   if(sub==="reset"){if(!canManage(i))return i.reply({content:"Only server managers can reset quota.",ephemeral:true});const r=db.resetGuild(i.guildId);return i.reply({content:"Quota reset. Next reset: <t:"+Math.floor(new Date(r.next).getTime()/1000)+":F>",ephemeral:true});}
  }
 }catch(err){console.error(err);if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:"Something went wrong. Check the bot logs or ask an administrator.",ephemeral:true}).catch(()=>{});}
});
client.login(process.env.DISCORD_TOKEN);
