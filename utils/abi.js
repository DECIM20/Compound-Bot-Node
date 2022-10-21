const comptroller = require("../abis/compoundv2/comptroller.json")
const cERC20 = require("../abis/compoundv2/cERC20.json")
const IERC20 = require("../abis/compoundv2/IERC20.json")
const priceFeed = require("../abis/compoundv2/priceFeed.json")
module.exports = {
  Compound: {
    comptroller: comptroller,
    cERC20: cERC20,
    priceFeed: priceFeed,
    IERC20: IERC20,
  },
}
