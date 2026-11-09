const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { UNITS, LIMITS } = require('../constants');

const Ingredient = sequelize.define(
  'Ingredient',
  {
    name: {
      type: DataTypes.STRING(60),
      allowNull: false,
      unique: true,
      validate: { notEmpty: true, len: [LIMITS.ingredientName.min, LIMITS.ingredientName.max] },
    },
    unit: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [UNITS] } },
  },
  { tableName: 'ingredients' }
);

module.exports = Ingredient;