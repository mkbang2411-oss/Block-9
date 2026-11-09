const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { LIMITS } = require('../constants');

const Chef = sequelize.define(
  'Chef',
  {
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: { notEmpty: true, len: [LIMITS.name.min, LIMITS.name.max] },
    },
    specialty: { type: DataTypes.STRING(120), validate: { len: [0, LIMITS.specialty.max] } },
  },
  { tableName: 'chefs' }
);

module.exports = Chef;