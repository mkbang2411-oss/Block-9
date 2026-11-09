const sequelize = require('../config/database');
const Dish = require('./Dish');
const Chef = require('./Chef');
const Ingredient = require('./Ingredient');
const User = require('./User');
const PasswordReset = require('./PasswordReset');
const RegisterOtp = require('./RegisterOtp');
const RecoveryCode = require('./RecoveryCode');

// Mỗi món BẮT BUỘC có một đầu bếp; không xóa được đầu bếp còn đang phụ trách món (RESTRICT)
Chef.hasMany(Dish, { foreignKey: { name: 'chefId', allowNull: false }, as: 'dishes', onDelete: 'RESTRICT' });
Dish.belongsTo(Chef, { foreignKey: { name: 'chefId', allowNull: false }, as: 'chef' });

// Món ăn <-> nguyên liệu (nhiều-nhiều); xóa một bên thì bảng nối tự xóa theo
Dish.belongsToMany(Ingredient, {
  through: 'dish_ingredients',
  as: 'ingredients',
  foreignKey: 'dishId',
  otherKey: 'ingredientId',
});
Ingredient.belongsToMany(Dish, {
  through: 'dish_ingredients',
  as: 'dishes',
  foreignKey: 'ingredientId',
  otherKey: 'dishId',
});

// Editor gắn với một đầu bếp (ABAC); xóa đầu bếp thì bỏ liên kết, không xóa tài khoản
Chef.hasMany(User, { foreignKey: { name: 'chefId', allowNull: true }, as: 'users', onDelete: 'SET NULL', constraints: false });
User.belongsTo(Chef, { foreignKey: { name: 'chefId', allowNull: true }, as: 'chef', constraints: false });

User.hasMany(PasswordReset, { foreignKey: { name: 'userId', allowNull: false }, as: 'resets', onDelete: 'CASCADE' });
PasswordReset.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, as: 'user' });

// Mã khôi phục MFA: xóa tài khoản thì xóa theo
User.hasMany(RecoveryCode, { foreignKey: { name: 'userId', allowNull: false }, as: 'recoveryCodes', onDelete: 'CASCADE' });
RecoveryCode.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, as: 'user' });

module.exports = { sequelize, Dish, Chef, Ingredient, User, PasswordReset, RegisterOtp, RecoveryCode };