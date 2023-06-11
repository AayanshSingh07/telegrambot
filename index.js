const express = require("express");
const { Telegraf } = require("telegraf");
const axios = require("axios");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const { BOT_TOKEN, URL, CHANNEL_ID, ADMIN_ID, PORT } = process.env;

const bot = new Telegraf(BOT_TOKEN);

const app = express();
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, "data")));


const log = (message) => {
    console.log(message);
    bot.telegram.sendMessage(CHANNEL_ID, message);
};

const saveUsers = () => {
    if (!fs.existsSync("./data/users.json")) {
        fs.writeFileSync("./data/users.json", JSON.stringify([]));
    }
    fs.writeFileSync("./data/users.json", JSON.stringify(users));
};

const saveMax = () => {
    try {
        let maxes = JSON.parse(fs.readFileSync("./data/max.json"));
        const temp = maxes.find((item) => item.data == new Date().toDateString());
        if (temp) {
            maxes = maxes.map((item) => {
                if (item.data == new Date().toDateString()) {
                    item.max = max;
                }
                return item;
            });

        } else {
            maxes.push({
                data: new Date().toDateString(),
                max,
            });
        }
        fs.writeFileSync("./data/max.json", JSON.stringify(maxes));
    } catch (e) {
        log("Error in saving max\n" + e.message + "\n\n");
    }
};


let users = JSON.parse(fs.readFileSync("./data/users.json"));
let today = new Date().toDateString();
let max = [{ name: "A", value: 0 }, { name: "B", value: 0 }, { name: "D", value: 0 }]
let prevRoundId = "";
let prevWinner = "";
let winningCount = 0;


bot.start((ctx) => {
    const { first_name, last_name = "" } = ctx.from;

    const user = users.find((user) => user.id == ctx.from.id);
    ctx.replyWithHTML("<b>Welcome " + (user ? "back " : "") + first_name + " " + last_name + "</b>\nFor help type /help");

    if (!user) {
        users.push({
            ...ctx.from,
            min: 1,
            isActive: false,
        });
        log("New User Added : " + first_name + " " + last_name + "\nUser Id : " + ctx.from.id);
    }
});

bot.help((ctx) => {
    ctx.replyWithHTML(
        "<b>GET OWN INFO</b>\n" +
        "/me\n\n" +
        "<b>SET MINIMUM STREAK</b>\n" +
        "/min 3\n\n" +
        "<b>ACTIVE NOTIFICATION</b>\n" +
        "/active\n\n" +
        "<b>DEACTIVE NOTIFICATION</b>\n" +
        "/deactive"
    );
});

bot.command("active", (ctx) => {
    const user = users.find((user) => user.id == ctx.from.id);
    if (user) {
        users = users.map((item) => {
            if (item.id == ctx.from.id) {
                item.isActive = true;
            }
            return item;
        });
        ctx.reply(
            "Now you will get notification\n Minnimum Streak : " + user.min
        );
        saveUsers();
    }
});

bot.command("deactive", (ctx) => {
    const user = users.find((user) => user.id == ctx.from.id);
    if (user) {
        user.isActive = false;
        users = users.map((item) => {
            if (item.id == ctx.from.id) {
                item.isActive = false;
            }
            return item;
        });
        ctx.reply("You will not get notification");
        saveUsers();
    }
});

bot.command("min", (ctx) => {
    const user = users.find((user) => user.id == ctx.from.id);
    if (user) {
        let min = parseInt(ctx.message.text.split(" ")[1]);
        if (min) {
            if (isNaN(min) || min < 1) {
                ctx.replyWithHTML("Wrong Input\nWrite like this\n<b>/min 5</b>");
                return;
            }
            users = users.map((item) => {
                if (item.id == ctx.from.id) {
                    item.min = min;
                }
                return item;
            });
            ctx.reply("Minnimum Streak : " + user.min);
            saveUsers();
        } else {
            ctx.replyWithHTML("Something Wrong\nWrite like this\n<b>/min 3</b>");
        }
    }
});

bot.command("getmax", (ctx) => {
    ctx.replyWithHTML(`<b>MAX STREAK</b>\n\n${max.map((item) => `${item.name} : ${item.value}`).join(`\n`)}`);
})

bot.command("aboutme", (ctx) => {
    let user = users.find((user) => user.id === ctx.from.id);
    if (user) {
        user = { ...user, ...ctx.from };
        users = users.filter((user) => user.id != ctx.from.id)
        users.push(user);
        ctx.reply(
            "Your Details : \n" +
            "\nMinimum Streak : " +
            user.min +
            "\nActive : " +
            user.isActive
        );
        saveUsers();
    } else {
        ctx.reply("You are not added");
    }
});

bot.command("users", (ctx) => {
    if (ctx.from.id == ADMIN_ID) {
        ctx.reply(JSON.stringify(users));
    }
});

setInterval(async () => {
    try {
        const res = await axios.get(URL);
        const data = res.data.result[0];

        if (data.status == "CLOSED" && prevRoundId !== data.roundId) {
            let currentWinner = "D";
            for (const item of data.marketRunner) {
                if (item.status == "WINNER") {
                    currentWinner = item.name.replace("Player ", "");
                    break;
                }
            }
            if (currentWinner == prevWinner) {
                winningCount++;
            } else {
                winningCount = 1;
            }
            prevWinner = currentWinner;
            prevRoundId = data.roundId;

            max = max.map((item) => {
                if (item.name == currentWinner) {
                    item.value = Math.max(item.value, winningCount);
                }
                return item;
            });

            if (today == new Date().toDateString()) {
                max = max.map((item) => {
                    if (item.name == currentWinner) {
                        item.value = Math.max(item.value, winningCount);
                    }
                    return item;
                });
            } else {
                today = new Date().toDateString();
                max = [{ name: "A", value: 0 }, { name: "B", value: 0 }, { name: "D", value: 0 }]
            }
            saveMax();
        }
    } catch (e) {
        console.log(e);
        log("Error in getting data\n" + e.message + "\n\n");
    }
}, 1000);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

app.get("/", (req, res) => {
    res.send("Bot is running");
});

app.get("/users", (req, res) => {
    res.json(users);
});

app.get("/max", (req, res) => {
    res.json(max);
});

app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
});