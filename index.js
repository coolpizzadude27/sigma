const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActivityType, PresenceUpdateStatus} = require('discord.js');
const fs = require('fs');
const { initializeDB, getUserRoles, updateUserRoles } = require('./database');

require('./keep_alive.js'); // Keep the bot alive

// Bot token and configurations
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; // Bot token from environment variables
const CLIENT_ID = '1324961446777454642'; // Replace with your bot's client ID
const GUILD_ID = '1245163900173946910'; // Replace with your server ID
const SETTINGS_FILE = './settings.json';
const roleAssignmentCache = new Map();

// Load settings
const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
let minAccountAge = settings.minAccountAge;

const WHITELISTED_USERS = new Set([
    '1155372852569178192', // Wendy
    '176989883531788288',  // Connor
    '1171104046980014221', // Deven
    '1229098218344677426'// M3ll
]);

function updateMinAccountAge(days) {
    settings.minAccountAge = days;
    minAccountAge = days; // Updates the in-memory variable instantly
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    console.log(`✅ Minimum account age updated to ${minAccountAge} days.`);
}

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions, // Added intent for reaction logging
    ],
});

// Channel, role, and user-specific configurations
const RECEIVING_CHANNEL_ID = '1327442375299301399'; // Channel to monitor
const RECEIVING_CHANNELTWITCH_ID = '1346371539448238121' // Twitch notifier
const SENDING_CHANNEL_ID = '1323430775001055373'; // Channel to send the messages
const ROLE_ID_TO_PING = '1248125180685844550'; // Replace with the role ID to ping
const TIKTOK_USERNAME = 'Tophiachubackup';
const TWITCH_USERNAME = 'Tophiachu';// TikTok username for the live notification
const REACTION_LOG_CHANNEL_ID = '1283557143273799680'; // Replace with your reaction log channel ID
const KICK_LOG_CHANNEL_ID = '1324963962596495421';
const AGE_ROLES_LOG_CHANNEL_ID = '1329707855737262171'; // Replace with the actual channel ID
const MINOR_ROLE_ID = '1251014508135186495'; // Replace with the Minor role ID
const ADULT_ROLE_ID = '1251016396616237089'; // Replace with the 18+ role ID

let lastNotificationTimestamp = 0;
const NOTIFICATION_COOLDOWN = 10000; // 30 seconds cooldown

// Reaction Logging Queue
const reactionQueue = [];
let isProcessingQueue = false;

// Add Reactions to the Queue
client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();

        reactionQueue.push({ user, reaction });
        processReactionQueue(); // Ensure the queue is processed
    } catch (error) {
        console.error('Failed to handle reaction:', error.message);
    }
});

// Process Reaction Logs in Batches
async function processReactionQueue() {
    if (isProcessingQueue || reactionQueue.length === 0) return;

    isProcessingQueue = true;

    while (reactionQueue.length > 0) {
        const batch = reactionQueue.splice(0, 4); // Get up to 4 reactions from the queue

        const logChannel = await client.channels.fetch(REACTION_LOG_CHANNEL_ID);
        if (!logChannel) {
            console.error('Log channel not found!');
            return;
        }

        const embeds = batch.map(({ user, reaction }) => {
            // Get the emoji image URL (only works for custom emojis)
            let emojiImage = null;
            if (reaction.emoji.id) {
                emojiImage = `https://cdn.discordapp.com/emojis/${reaction.emoji.id}.png`;
            }

            return new EmbedBuilder()
                .setColor('#00FF00')
                .setAuthor({
                    name: user.tag,
                    iconURL: user.displayAvatarURL({ dynamic: true }),
                })
                .setTitle('Reaction Added')
                .setDescription(`A reaction was added to [this message](${reaction.message.url}).`)
                .addFields(
                    { name: 'Reacted By', value: `<@${user.id}>`, inline: true },
                    { name: 'Emoji Used', value: reaction.emoji.toString(), inline: true },
                    { name: 'Channel', value: `<#${reaction.message.channelId}>`, inline: true }
                )
                .setFooter({
                    text: `Message ID: ${reaction.message.id}`,
                })
                .setTimestamp()
                .setThumbnail(emojiImage); // Add the emoji image if available
        });

        try {
            await logChannel.send({ embeds });
        } catch (error) {
            console.error('Failed to send reaction logs:', error.message);
        }

        // Wait 5 seconds before processing the next batch
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    isProcessingQueue = false;
}


// Handle TikTok Live Notification
client.on('messageCreate', async (message) => {
    // Ignore messages from bots unless they're from a webhook
    if (message.author.bot && !message.webhookId) return;

    // Check if the message is from the specified receiving channel
    if (message.channel.id === RECEIVING_CHANNEL_ID) {
        try {
            // Identify the webhook message using a specific pattern
            const isFromSpecificWebhook =
                message.webhookId && message.content.includes('<@&1327451062860386334>'); // Replace with a unique pattern in the webhook's messages

            const currentTimestamp = Date.now();

            if (isFromSpecificWebhook && currentTimestamp - lastNotificationTimestamp > NOTIFICATION_COOLDOWN) {
                lastNotificationTimestamp = currentTimestamp;

                const targetChannel = await client.channels.fetch(SENDING_CHANNEL_ID);

                if (targetChannel && targetChannel.isTextBased()) {
                    const liveLink = `https://www.tiktok.com/@tophiachubackup/live`;

                    // Check bot permissions for mentioning roles
                    const botMember = await targetChannel.guild.members.fetch(client.user.id);
                    if (!botMember.permissions.has('MentionEveryone')) {
                        console.error('Bot lacks permission to mention roles.');
                        await targetChannel.send('❌ Bot does not have permission to mention roles.');
                        return;
                    }

                    // Send the embed
                    const embed = new EmbedBuilder()
                        .setColor('#4482ff')
                        .setTitle(`🐧 ${TIKTOK_USERNAME} is live on TikTok!`)
                        .setDescription(`🔴 Don't miss the live stream!`)
                        .setTimestamp()
                        .setFooter({ text: 'Join the live now!' });

                    await targetChannel.send({
                        content: `<@&${ROLE_ID_TO_PING}> 🔔 **The Beast Is Live!🧌**`,
                        embeds: [embed],
                    });

                    // Send the TikTok live link
                    await targetChannel.send(liveLink);
                    console.log('Live notification sent successfully.');
                } else {
                    console.error('Target channel not found or not text-based.');
                }
            }
        } catch (error) {
            console.error('Error sending live notification:', error.message);
        }
    }
});
// TWITCH
client.on('messageCreate', async (message) => {
    // Ignore messages from bots unless they're from a webhook
    if (message.author.bot && !message.webhookId) return;

    // Check if the message is from the specified receiving channel
    if (message.channel.id === RECEIVING_CHANNELTWITCH_ID) {
        try {
            // Identify the webhook message using a specific pattern
            const isFromSpecificWebhook =
                message.webhookId && message.content.includes('<@&1346371783242154044>'); // Replace with a unique pattern in the webhook's messages

            const currentTimestamp = Date.now();

            if (isFromSpecificWebhook && currentTimestamp - lastNotificationTimestamp > NOTIFICATION_COOLDOWN) {
                lastNotificationTimestamp = currentTimestamp;

                const twitchtargetChannel = await client.channels.fetch(SENDING_CHANNEL_ID);

                if (twitchtargetChannel && twitchtargetChannel.isTextBased()) {
                    const twitchliveLink = `https://www.twitch.tv/tophiachu`;

                    // Check bot permissions for mentioning roles
                    const botMember = await twitchtargetChannel.guild.members.fetch(client.user.id);
                    if (!botMember.permissions.has('MentionEveryone')) {
                        console.error('Bot lacks permission to mention roles.');
                        await twitchtargetChannel.send('❌ Bot does not have permission to mention roles.');
                        return;
                    }

                    // Send the embed
                    const embed = new EmbedBuilder()
                        .setColor('#4482ff')
                        .setTitle(`🐧 ${TWITCH_USERNAME} is live on Twitch!`)
                        .setDescription(`🟣 Don't miss the live stream!`)
                        .setTimestamp()
                        .setFooter({ text: 'Join the live now!' });

                    await targetChannel.send({
                        content: `<@&${ROLE_ID_TO_PING}> 🔔 **The Beast Is Live!🧌**`,
                        embeds: [embed],
                    });

                    // Send the TikTok live link
                    await targetChannel.send(twitchliveLink);
                    console.log('Live notification sent successfully.');
                } else {
                    console.error('Target channel not found or not text-based.');
                }
            }
        } catch (error) {
            console.error('Error sending live notification:', error.message);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    console.log(`🔎 Member Joined: ${member.user.tag} (ID: ${member.id})`);

    const accountCreationDate = member.user.createdAt;
    const accountAgeDays = Math.floor((Date.now() - accountCreationDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`📅 Account Age of ${member.user.tag}: ${accountAgeDays} days (Minimum Required: ${minAccountAge} days)`);

    const logChannel = await client.channels.fetch(KICK_LOG_CHANNEL_ID);
    if (!logChannel) {
        console.error('⚠️ Kick log channel not found!');
        return;
    }

    if (accountAgeDays < minAccountAge) {
        const reason = `Account is too new (Created ${accountAgeDays} days ago).`;

        let dmStatus = '❌'; // Default to "DM failed"
        try {
            await member.send(`You have been removed from **${member.guild.name}** because your account is too new.`);
            console.log(`📨 Successfully sent DM to ${member.user.tag}`);
            dmStatus = '✅'; // Update to "DM succeeded"
        } catch (error) {
            console.warn(`⚠️ Failed to DM ${member.user.tag}: ${error.message}`);
        }

        console.log(`⏳ Waiting 2 seconds before kicking ${member.user.tag}...`);

        setTimeout(async () => {
            try {
                await member.kick(reason);
                console.log(`✅ Successfully kicked ${member.user.tag} from the server.`);

                // Create the embed message
                const kickEmbed = new EmbedBuilder()
                    .setColor('#ff0000') // Red color for kick logs
                    .setTitle('🚨 User Kicked')
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '👤 User', value: `${member.user.tag} (<@${member.id}>)`, inline: false },
                        { name: '📅 Account Age', value: `${accountAgeDays} days`, inline: true },
                        { name: '❌ Reason', value: reason, inline: false },
                        { name: '📩 DM\'d User', value: dmStatus, inline: true } // Add DM status
                    )
                    .setFooter({ text: `User ID: ${member.id}` })
                    .setTimestamp();

                // Send embed to the log channel
                await logChannel.send({ embeds: [kickEmbed] });
            } catch (error) {
                console.error(`❌ Failed to kick ${member.user.tag}: ${error.message}`);
            }
        }, 2000); // 2-second delay before kicking
    } else {
        console.log(`✅ ${member.user.tag} meets the account age requirement.`);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const logChannel = await client.channels.fetch(AGE_ROLES_LOG_CHANNEL_ID);
    if (!logChannel) return console.error('⚠️ Age roles log channel not found!');

    const hadMinorRole = oldMember.roles.cache.has(MINOR_ROLE_ID);
    const hasMinorRole = newMember.roles.cache.has(MINOR_ROLE_ID);
    const hadAdultRole = oldMember.roles.cache.has(ADULT_ROLE_ID);
    const hasAdultRole = newMember.roles.cache.has(ADULT_ROLE_ID);

    let logMessage = null;
    let roleChangeType = null;

    if (hadMinorRole && !hasMinorRole && hasAdultRole) {
        roleChangeType = 'Minor to 18+';
    } else if (hadAdultRole && !hasAdultRole && hasMinorRole) {
        roleChangeType = '18+ to Minor';
    }

    if (roleChangeType) {
        const userId = newMember.id;
        const previousRole = roleChangeType === 'Minor to 18+' ? MINOR_ROLE_ID : ADULT_ROLE_ID;
        const roleAssignmentTime = roleAssignmentCache.get(`${userId}-${previousRole}`);

        let durationMessage = '';
        if (roleAssignmentTime) {
            const duration = Date.now() - roleAssignmentTime;
            const durationDays = Math.floor(duration / (1000 * 60 * 60 * 24));
            const durationHours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const durationMinutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
            durationMessage = `\n⏳ **Duration with Role:** ${durationDays}d ${durationHours}h ${durationMinutes}m`;
        }

        const embed = new EmbedBuilder()
            .setColor(roleChangeType === 'Minor to 18+' ? '#00FF00' : '#FF0000')
            .setTitle(`🔞 Role Change: ${roleChangeType}`)
            .setDescription(`**${newMember.user.tag}** (<@${newMember.id}>) has switched roles.${durationMessage}`)
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `User ID: ${newMember.id}` })
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
        console.log(`✅ Logged age role change: ${roleChangeType} for ${newMember.user.tag}`);
    }

    // Update the cache with the new role assignment time
    if (hasMinorRole) {
        roleAssignmentCache.set(`${newMember.id}-${MINOR_ROLE_ID}`, Date.now());
    } else if (hasAdultRole) {
        roleAssignmentCache.set(`${newMember.id}-${ADULT_ROLE_ID}`, Date.now());
    }
});

// Slash Commands
const commands = [
    {
        name: 'mc',
        description: 'Checks if specific accounts are live. (Whitelist Required)',
    },
    {
        name: 'listaccounts',
        description: 'Shows the list of monitored accounts. (Whitelist Required)',
    },
    {
        name: 'ping',
        description: 'Tests the bot latency and responsiveness. (Whitelist Required)',
    },
    {
        name: 'setage',
        description: 'Sets the minimum account age (in days) required to join. (Whitelist Required)',
        options: [
            {
                name: 'days',
                type: 4, // Correct type for INTEGER
                description: 'Minimum account age in days.',
                required: true,
            },
        ],
    },
    {
        name: 'currentage',
        description: 'Shows the current minimum account age required to join. (Whitelist Required)',
    }
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Register Slash Commands
(async () => {
    try {
        console.log('Refreshing slash commands...');
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
            body: commands,
        });
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
})();

// Handle Slash Commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, user, options } = interaction;

    if (!WHITELISTED_USERS.has(user.id)) {
        return interaction.reply({ content: '❌ You are not authorized to use this command.', ephemeral: true });
    }
    
    if (commandName === 'mc') {
        await interaction.reply('Checking live statuses... Please wait.');
        const liveAccounts = [];

        for (const username of TIKTOK_USERNAMES) {
            const status = await getTikTokLiveStatus(username);
            if (status.isLive) {
                liveAccounts.push(`🔴 **${username}** is live! Watch: ${status.liveUrl}`);
            }
        }

        if (liveAccounts.length > 0) {
            await interaction.followUp(liveAccounts.join('\n'));
        } else {
            await interaction.followUp('❌ None of the monitored accounts are live at the moment.');
        }
    } else if (commandName === 'listaccounts') {
        const accountsList = TIKTOK_USERNAMES.map((username, index) => `${index + 1}. ${username}`).join('\n');
        await interaction.reply(`📄 **Monitored Accounts:**\n${accountsList}`);
    } else if (commandName === 'ping') {
        await interaction.reply({ content: 'Pong!' });
        const sent = await interaction.fetchReply();
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);
        await interaction.editReply(`🏓 Pong! Latency: **${latency}ms**, API Latency: **${apiLatency}ms**.`);
    } else if (commandName === 'setage') {
        const days = options.getInteger('days');
        if (days < 0) {
            return interaction.reply({ content: '❌ Minimum account age cannot be negative.', ephemeral: true });
        }

        updateMinAccountAge(days); // Updates instantly without restarting the bot
        await interaction.reply(`✅ Minimum account age has been set to **${minAccountAge}** days.`);
    } else if (commandName === 'currentage') {
        const ageEmbed = new EmbedBuilder()
            .setColor('#3498db') // Blue color
            .setTitle('📅 Current Minimum Account Age')
            .setDescription(`The minimum account age required to join this server is **${minAccountAge} days**.`)
            .setFooter({ text: 'This prevents new accounts from joining.' })
            .setTimestamp();

        await interaction.reply({ embeds: [ageEmbed] });
    }
});

// Bot Ready Event
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Set bot status and activity
    client.user.setPresence({
        status: PresenceUpdateStatus.DoNotDisturb, // Sets "Do Not Disturb" status
        activities: [{
            name: "Rupaul is big", // Custom status message
            type: ActivityType.Playing // You can change this to Watching, Listening, etc.
        }]
    });
});

// Start the Bot
client.login(DISCORD_TOKEN);
