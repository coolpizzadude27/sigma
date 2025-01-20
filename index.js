const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');

require('./keep_alive.js'); // Keep the bot alive

// Bot token and configurations
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; // Bot token from environment variables
const CLIENT_ID = '1324961446777454642'; // Replace with your bot's client ID
const GUILD_ID = '1245163900173946910'; // Replace with your server ID
const SETTINGS_FILE = './settings.json';

// Load settings
const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
let minAccountAge = settings.minAccountAge;

//const WHITELISTED_USERS = [
   // '1155372852569178192 ', // wendy
   // '176989883531788288', // connor
   // '1171104046980014221' // deven
//];

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
const SENDING_CHANNEL_ID = '1323430775001055373'; // Channel to send the messages
const ROLE_ID_TO_PING = '1248125180685844550'; // Replace with the role ID to ping
const TIKTOK_USERNAME = 'Tophiachubackup'; // TikTok username for the live notification
const REACTION_LOG_CHANNEL_ID = '1283557143273799680'; // Replace with your reaction log channel ID
const KICK_LOG_CHANNEL_ID = '1324963962596495421';

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

client.on('guildMemberAdd', async (member) => {
    console.log(`🔎 Member Joined: ${member.user.tag} (ID: ${member.id})`);

    const accountCreationDate = member.user.createdAt;
    const accountAgeDays = Math.floor((Date.now() - accountCreationDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`📅 Account Age of ${member.user.tag}: ${accountAgeDays} days (Minimum Required: ${minAccountAge} days)`);

    if (accountAgeDays < minAccountAge) {
        const reason = `Your account is too new to join this server.`;

        try {
            await member.send(reason);
            console.log(`📨 Successfully sent DM to ${member.user.tag}`);
        } catch (error) {
            console.warn(`⚠️ Failed to DM ${member.user.tag}: ${error.message}`);
        }

        // Add a 1-2 second delay before kicking
        const delay = Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
        console.log(`⏳ Waiting ${delay / 500} seconds before kicking ${member.user.tag}...`);

        setTimeout(async () => {
            try {
                await member.kick(reason);
                console.log(`✅ Successfully kicked ${member.user.tag} from the server.`);
            } catch (error) {
                console.error(`❌ Failed to kick ${member.user.tag}: ${error.message}`);
            }
        }, delay);
    } else {
        console.log(`✅ ${member.user.tag} meets the account age requirement.`);
    }
});

const cooldowns = new Set(); // Store users in cooldown

client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Split message into words and check for an exact match of "fat"
    const words = message.content.toLowerCase().split(/\s+/);
    if (words.includes('fat')) {
        // Check if the user is in cooldown
        if (cooldowns.has(message.author.id)) return;

        // Add user to cooldown
        cooldowns.add(message.author.id);

        try {
            await message.reply(`<@!1141175309580898364>`);
        } catch (error) {
            console.error('Error sending auto-reply:', error.message);
        }

        // Remove user from cooldown after 2 seconds
        setTimeout(() => {
            cooldowns.delete(message.author.id);
        }, 2000);
    }
});

// Slash Commands
const commands = [
    {
        name: 'mc',
        description: 'Checks if specific accounts are live.',
    },
    {
        name: 'listaccounts',
        description: 'Shows the list of monitored accounts.',
    },
    {
        name: 'ping',
        description: 'Tests the bot latency and responsiveness.',
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

    const { commandName, options } = interaction;
    
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
    } 
});

// Bot Ready Event
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Start the Bot
client.login(DISCORD_TOKEN);
