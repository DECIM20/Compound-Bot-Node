const express = require("express")
const fs = require("fs")
const bot = require("./Bot")
const app = express()
require("dotenv").config()

const port = process.env.PORT || 4000

//functions
const start = async () => {
  await bot.getPriceFeed()
  ///bot.getUserData()
  bot.getAllUserData()
  //bot.getUserDataHigh()
}

start()

app.get('/', (req, res) => res.json("Bot is Running"))

app.listen(port, () => console.log("Listening On Port", port))
