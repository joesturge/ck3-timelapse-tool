const { Sequelize, DataTypes } = require("sequelize");

/**
 * @param {Sequelize} sequelize
 */
function BuildModels(sequelize) {
  const Person = sequelize.define("Person", {
    // Model attributes are defined here
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING,
    },
    dateOfBirth: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    dateOfDeath: {
      type: DataTypes.DATE,
    },
    sex: {
      type: DataTypes.ENUM("Male", "Female"),
      allowNull: false,
    },
    primaryTitle: {
      type: DataTypes.INTEGER,
    },
    liege: {
      type: DataTypes.INTEGER,
    },
  });

  const Title = sequelize.define("Title", {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
    },
    deFactoLiege: {
      type: DataTypes.INTEGER,
    },
    color: {
      type: DataTypes.STRING,
    },
    rank: {
      type: DataTypes.ENUM("B", "C", "D",  "K", "E", "X")
    }
  });

  const TitleHistory = sequelize.define("TitleHistory", {
    title: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    holder: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
  return {
    Person,
    Title,
    TitleHistory
  }
}

module.exports = BuildModels;
