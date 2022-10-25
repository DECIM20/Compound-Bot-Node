const axios = require("axios")
const fs = require("fs")
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

class Bot {
  constructor() {
    this.getUserData = this.getUserData.bind(this)
    this.gasFunction = this.gasFunction.bind(this)
    this.wait = this.wait.bind(this)
    this.startWriter = fs.createWriteStream("./data/startWriter.txt", {
      flags: "a",
    })
    this.updateWriter = fs.createWriteStream("./data/updateWriter.txt", {
      flags: "a",
    })
    this.liquidateWriter = fs.createWriteStream("./data/liquidateWriter.txt", {
      flags: "a",
    })
    this.dataWriter = fs.createWriteStream("./data/dataWriter.txt", {
      flags: "a",
    })
    this.generalWriter = fs.createWriteStream("./data/generalWriter.txt", {
      flags: "a",
    })
    this.writeTo = this.writeTo.bind(this)
    // this.user = provider
  }

  writeTo = (name, data) => {
    let writer = null
    switch (name) {
      case "start":
        if (!this.startWriter.writable) {
          this.startWriter = fs.createWriteStream("./data/startWriter.txt", {
            flags: "a",
          })
        }
        writer = this.startWriter
        break
      case "liquidate":
        if (!this.liquidateWriter.writable) {
          this.liquidateWriter = fs.createWriteStream(
            "./data/liquidateWriter.txt",
            { flags: "a" }
          )
        }
        writer = this.liquidateWriter
        break
      case "update":
        if (!this.updateWriter.writable) {
          this.updateWriter = fs.createWriteStream("./data/updateWriter.txt", {
            flags: "a",
          })
        }
        writer = this.updateWriter
        break
      case "data":
        if (!this.dataWriter.writable) {
          this.dataWriter = fs.createWriteStream("./data/dataWriter.txt", {
            flags: "a",
          })
        }
        writer = this.dataWriter
        break

      default:
        if (!this.generalWriter.writable) {
          this.generalWriter = fs.createWriteStream(
            "./data/generalWriter.txt",
            { flags: "a" }
          )
        }
        writer = this.generalWriter
        break
    }
    writer.write("[" + String(Date.now()) + "] " + data + "\n")
  }

  getUniqueListBy(arr, key) {
    return [...new Map(arr.map(item => [item[key], item])).values()]
  }

  getPriceFeed = async () => {
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

  getUserData = async () => {
    try {
      console.log("Before Looping")
      const comp = new web3.eth.Contract(
        abi.Compound.comptroller,
        "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B"
      )

      const priceFeed = new web3.eth.Contract(
        abi.Compound.priceFeed,
        address.Compound.priceFeed
      )

      const ethPrice = await priceFeed.methods
        .getUnderlyingPrice("0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5")
        .call()

      // const { status, gasLimit, gasPrice } = await this.gasFunction()

      // const avgGasUsedInLiquidation = 710000

      // const totalGasCost =
      //   ((avgGasUsedInLiquidation * Number(gasPrice)) / 10 ** 18) *
      //   (ethPrice / 10 ** 18).toFixed(2)

      // console.log("Total Gas Cost is", totalGasCost)

      let i
      for (i = 1; i <= 10; i++) {
        let url = await axios.post(
          "https://api.compound.finance/api/v2/account" /* ?max_health%5Bvalue%5D=1.0 */,
          {
            "max_health[value]": "1.0",
            page_number: `${i}`,
          }
        )

        const data = url.data.accounts
        await Promise.all(
          data.map(async a => {
            console.log("Looping Through Accounts")

            const tokens = a.tokens
            let borrow = []
            let collateral = []

            if (
              a.total_borrow_value_in_eth.value > 0.8
              // &&
              //Number(totalGasCost) < 13
            ) {
              console.log("Filtered Data")

              const liqCall = await comp.methods
                .getAccountLiquidity(a.address)
                .call()

              console.log("Address", a.address)

              const liquidity = liqCall[1]

              const shortfall = liqCall[2]

              console.log("Shortfall is", shortfall)
              console.log("Liquidity is", liquidity)

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
                    borrow_balance_underlying:
                      i.borrow_balance_underlying.value,
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
                    supply_balance_underlying:
                      i.supply_balance_underlying.value,
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
                max_supplied_token.address === max_borrowed_token.address ||
                max_supplied_token.symbol === "cUSDP" ||
                max_borrowed_token.symbol === "cUSDP" ||
                max_supplied_token.symbol === "cREP" ||
                max_borrowed_token.symbol === "cREP"
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

                this.writeTo(
                  writerTypes.liquidate,
                  "Debt > 1000$" +
                    "     " +
                    userAddress +
                    "     " +
                    max_supplied_token.symbol +
                    "     " +
                    max_borrowed_token.symbol +
                    "     " +
                    Number(max_borrowed_token.debt_in_usd).toFixed(2) +
                    "     " +
                    Number(a.health.value).toFixed(2)
                )

                console.log("Wrote to file")
              }
            } else {
              console.log("No data Found")
            }
          })
        )
      }
      await this.wait(2000)
      this.getUserData()
      // return JSON.stringify(userSummary)
    } catch (err) {
      console.log("error in getting data")
      await this.wait(2000)
      this.getUserData()
      // console.log(err)
      return
    }
  }

  getAllUserData = async () => {
    try {
      console.log("Before Looping")
      const comp = new web3.eth.Contract(
        abi.Compound.comptroller,
        "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B"
      )

      const priceFeed = new web3.eth.Contract(
        abi.Compound.priceFeed,
        address.Compound.priceFeed
      )

      const ethPrice = await priceFeed.methods
        .getUnderlyingPrice("0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5")
        .call()

      // const { status, gasLimit, gasPrice } = await this.gasFunction()

      // const avgGasUsedInLiquidation = 710000

      // const totalGasCost =
      //   ((avgGasUsedInLiquidation * Number(gasPrice)) / 10 ** 18) *
      //   (ethPrice / 10 ** 18).toFixed(2)

      // console.log("Total Gas Cost is", totalGasCost)
      
      console.log("Price Fetch Successfull")

      let i
      for (i = 1; i <= 3; i++) {
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

              const liqCall = await comp.methods
                .getAccountLiquidity(a.address)
                .call()

              console.log("Address", a.address)

              const liquidity = liqCall[1]

              const shortfall = liqCall[2]

              console.log("Shortfall is", shortfall)
              console.log("Liquidity is", liquidity)

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
                    borrow_balance_underlying:
                      i.borrow_balance_underlying.value,
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
                    supply_balance_underlying:
                      i.supply_balance_underlying.value,
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

                this.writeTo(
                  writerTypes.general,
                  "{" +
                    "userAdd: " +
                    `"${userAddress}"` +
                    ", maxSuppliedToken: " +
                    `"${max_supplied_token.symbol}"` +
                    ", maxBorrowedToken: " +
                    `"${max_borrowed_token.symbol}"` +
                    ", debt: " +
                    Number(max_borrowed_token.debt_in_usd).toFixed(0) +
                    ", health: " +
                    Number(a.health.value).toFixed(2) +
                    "},"
                )

                //https://www.convertsimple.com/convert-javascript-array-to-csv/

                console.log("Wrote to file")
              }
            } else {
              console.log("No data Found")
            }
          })
        )
      }
      await this.wait(2000)
      this.getAllUserData()
      // return JSON.stringify(userSummary)
    } catch (err) {
      console.log("error in getting data")
      await this.wait(2000)
      this.getAllUserData()
      // console.log(err)
      return
    }
  }

  getUserDataHigh = async () => {
    try {
      console.log("Before Looping")
      const comp = new web3.eth.Contract(
        abi.Compound.comptroller,
        "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B"
      )

      const priceFeed = new web3.eth.Contract(
        abi.Compound.priceFeed,
        address.Compound.priceFeed
      )

      const ethPrice = await priceFeed.methods
        .getUnderlyingPrice("0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5")
        .call()

      // const { status, gasLimit, gasPrice } = await this.gasFunction()

      // const avgGasUsedInLiquidation = 710000

      // const totalGasCost =
      //   ((avgGasUsedInLiquidation * Number(gasPrice)) / 10 ** 18) *
      //   (ethPrice / 10 ** 18).toFixed(2)

      let i
      for (i = 1; i <= 10; i++) {
        let url = await axios.post(
          "https://api.compound.finance/api/v2/account" /* ?max_health%5Bvalue%5D=1.0 */,
          {
            "max_health[value]": "1.0",
            page_number: `${i}`,
          }
        )

        const data = url.data.accounts
        await Promise.all(
          data.map(async a => {
            console.log("Looping Through Accounts")

            const tokens = a.tokens
            let borrow = []
            let collateral = []

            // Condition 1 checks if user has borrowed more than 5000$
            // Condition 2 checks that the total gas estimated to be used is less than 25$
            if (
              a.total_borrow_value_in_eth.value > 3.83
              // &&
              //Number(totalGasCost) < 25
            ) {
              console.log("Filtered Data")

              const liqCall = await comp.methods
                .getAccountLiquidity(a.address)
                .call()

              console.log("Address", a.address)

              const liquidity = liqCall[1]

              const shortfall = liqCall[2]

              console.log("Shortfall is", shortfall)
              console.log("Liquidity is", liquidity)

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
                    borrow_balance_underlying:
                      i.borrow_balance_underlying.value,
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
                    supply_balance_underlying:
                      i.supply_balance_underlying.value,
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
                max_supplied_token.address === max_borrowed_token.address ||
                max_supplied_token.symbol === "cUSDP" ||
                max_borrowed_token.symbol === "cUSDP" ||
                max_supplied_token.symbol === "cREP" ||
                max_borrowed_token.symbol === "cREP"
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

                this.writeTo(
                  writerTypes.data,
                  "Debt > 5000$" +
                    userAddress +
                    " " +
                    max_supplied_token.symbol +
                    " " +
                    max_borrowed_token.symbol +
                    " " +
                    Number(max_borrowed_token.debt_in_usd).toFixed(2) +
                    " " +
                    Number(a.health.value).toFixed(2)
                )

                console.log("Wrote to file")
              }
            } else {
              console.log("No data Found")
            }
          })
        )
      }
      await this.wait(2000)

      this.getUserDataHigh()
      // return JSON.stringify(userSummary)
    } catch (err) {
      console.log("error in getting data")
      await this.wait(2000)

      this.getUserDataHigh()
      // console.log(err)
      return
    }
  }

  wait = async ms => {
    return new Promise(res => {
      setTimeout(() => res(), ms)
    })
  }

  gasFunction = async () => {
    return new Promise(async (resolve, reject) => {
      // console.log(Date.now())
      try {
        const gasg = await axios.get(
          `https://api.etherscan.com/api?module=proxy&action=eth_getBlockByNumber&tag=pending&boolean=true`
        )
        console.log(gasg.data.result.gasLimit, "lim")
        const gasLimit = BigNumber(gasg.data.result.gasLimit * 0.75)
          .dp(0)
          .toString()
        console.log(gasLimit, "10%")
        //await this.wait(100)
        const gas = await axios.get(
          "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice"
        )

        console.log(
          BigNumber(gas.data.result * 1.1)
            .dp(0)
            .toString(),
          "fast"
        )
        // console.log(gas.data.result.FastGasPrice, 'fas')
        const gasPrice = BigNumber(gas.data.result * 1.1)
          .dp(0)
          .toString()

        console.log(gasPrice, "gwei")
        resolve({ success: true, gasLimit, gasPrice })
      } catch (error) {
        console.log(error, "gasFunction")
        reject({ success: false })
      }
    })
  }
}

const bot = new Bot()
module.exports = bot

// excel for node
