const express = require("express")
const fs = require("fs")
const app = express()
require("dotenv").config()

const port = process.env.PORT || 4000

const axios = require("axios")
const Web3 = require("web3")
const BigNumber = require("bignumber.js")
const abi = require("./utils/abi")
const address = require("./utils/address")
const writerTypes = {
  liquidate: "liquidate",
  start: "start",
  update: "update",
  data: "data",
  general: "general",
}

const tokenList = require("./utils/TokenList")
const poolList = require("./utils/PoolList")

const web3 = new Web3(
  new Web3.providers.HttpProvider(
    "https://mainnet.infura.io/v3/b2e0749b556b411ea617f27d16c566d9"
  )
)

const finalTokenArray = []

const outputArray = []

const getPriceFeed = async () => {
  const priceFeed = new web3.eth.Contract(
    abi.Compound.priceFeed,
    address.Compound.priceFeed
  )

  console.log("Below Price feed")

  const tokens_Array = tokenList

  try {
    await Promise.all(
      tokens_Array.map(async a => {
        const tokenPrice = await priceFeed.methods
          .getUnderlyingPrice(a.address)
          .call()

        const price = Number(tokenPrice)

        const addr = a.address

        const obj = {
          address: addr,
          price: price,
          underlying_address: a.underlying_address,
          decimals: a.decimals,
        }

        finalTokenArray.push(obj)
      })
    )
    console.log("Price Fetch Successful")
  } catch (e) {
    console.log(e)
  }
}

const getAllUserData = async () => {
  try {
    console.log("Before Looping")

    let i
    for (i = 1; i <= 10; i++) {
      let url = await axios.post(
        "https://api.compound.finance/api/v2/account" /* ?max_health%5Bvalue%5D=1.0 */,
        {
          "max_health[value]": "1.0",
          page_number: `${i}`,
        }
      )

      console.log(i)

      const data = url.data.accounts
      await Promise.all(
        data.map(async (a, index) => {
          console.log("Looping Through Accounts")

          const tokens = a.tokens
          let borrow = []
          let collateral = []

          if (
            a.total_borrow_value_in_eth.value > 0.1
            // &&
            //Number(totalGasCost) < 13
          ) {
            console.log("Filtered Data")

            // const liqCall = await comp.methods
            //   .getAccountLiquidity(a.address)
            //   .call()

            // console.log("Address", a.address)

            // const liquidity = liqCall[1]

            // const shortfall = liqCall[2]

            // console.log("Shortfall is", shortfall)
            // console.log("Liquidity is", liquidity)

            await Promise.all(
              tokens.map(async i => {
                let underlyingAddress
                let decimals
                let tokenPrice

                try {
                  const result = finalTokenArray.filter(e => {
                    return (
                      String(e.address).toLowerCase() ===
                      String(i.address).toLowerCase()
                    )
                  })

                  tokenPrice = result[0].price
                  decimals = result[0].decimals
                  underlyingAddress = result[0].underlying_address
                } catch (e) {
                  console.log("Token Not Found")
                }

                const debt = {
                  address: i.address,
                  borrow_balance_underlying: i.borrow_balance_underlying.value,
                  lifetime_borrow_interest_accrued:
                    i.lifetime_borrow_interest_accrued.value,
                  symbol: i.symbol,
                  address_underlying: underlyingAddress,
                  decimals_underlying: decimals,
                  debt_in_usd:
                    (Number(tokenPrice) / 10 ** (36 - decimals)) *
                    i.borrow_balance_underlying.value,
                }

                const col = {
                  address: i.address,
                  lifetime_supply_interest_accrued:
                    i.lifetime_supply_interest_accrued.value,
                  supply_balance_underlying: i.supply_balance_underlying.value,
                  symbol: i.symbol,
                  address_underlying: underlyingAddress,
                  decimals_underlying: decimals,
                  collateral_in_usd:
                    (Number(tokenPrice) / 10 ** (36 - decimals)) *
                    i.supply_balance_underlying.value,
                }

                if (Number(i.borrow_balance_underlying.value) > 0) {
                  borrow.push(debt)
                }
                if (Number(i.supply_balance_underlying.value) > 0) {
                  collateral.push(col)
                } else {
                  collateral.push(col)
                  borrow.push(debt)
                }
              })
            )

            const max_borrowed_token = borrow.reduce((prev, current) => {
              if (+prev.debt_in_usd > +current.debt_in_usd) {
                return prev
              } else {
                return current
              }
            }, [])

            const max_supplied_token = collateral.reduce((prev, current) => {
              if (+prev.collateral_in_usd > +current.collateral_in_usd) {
                return prev
              } else {
                return current
              }
            }, [])

            console.log("After getting max tokens")

            if (
              max_supplied_token.address === max_borrowed_token.address //||
              // max_supplied_token.symbol === "cUSDP" ||
              // max_borrowed_token.symbol === "cUSDP" ||
              // max_supplied_token.symbol === "cREP" ||
              // max_borrowed_token.symbol === "cREP"
            ) {
              console.log("")
            } else {
              const userAddress = a.address

              // const cTokenContract = new web3.eth.Contract(
              //   abi.Compound.cERC20,
              //   max_borrowed_token.address_underlying
              // )

              // const debtToCover = await cTokenContract.methods
              //   .borrowBalanceCurrent(userAddress)
              //   .call()

              // const debtToLiquidate = Number(debtToCover) / 2

              const obj = {
                userAdd: userAddress,
                maxSuppliedToken: max_supplied_token.symbol,
                maxBorrowedToken: max_borrowed_token.symbol,
                debt: Number(max_borrowed_token.debt_in_usd).toFixed(0),
                health: Number(a.health.value).toFixed(2),
              }
              
              const exists = outputArray.findIndex(element => element.userAdd === userAddress) > -1
              
              if(!exists){
                 outputArray.push(obj)

              //https://www.convertsimple.com/convert-javascript-array-to-csv/

              console.log("Wrote to file")
              }

            }
          } else {
            console.log("No data Found")
          }
          await wait(2000)
        })
      )
    }
    await wait(2000)
    getAllUserData()
    // return JSON.stringify(userSummary)
  } catch (err) {
    console.log(err)
    await wait(2000)
    getAllUserData()
    // console.log(err)
    return
  }
}

const wait = async ms => {
  return new Promise(res => {
    setTimeout(() => res(), ms)
  })
}

const start = async () => {
  await getPriceFeed()
  ///bot.getUserData()
  getAllUserData()
  //bot.getUserDataHigh()
}

start()

app.get("/", (req, res) => res.json(outputArray))

app.listen(port, () => console.log("Listening On Port", port))
