const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { AuthenticationError } = require('apollo-server')
const seed = require('../scripts/seed')

const {
  Workout,
  Session,
  User,
  Exercise,
  ExerciseInstance
} = require('../model')

module.exports = {
  seed: seed,

  // User Interactions ///////////////////////////////////////////////////
  signup: async (parent, args) => {
    const { username, password } = args

    return await User.signup(username, password)
  },

  
  login: async (parent, args) => {
    const { username, password } = args

    return await User.login(username, password)
  },
  
  

  // Workout Interactions ////////////////////////////////////////////////
  createWorkout: async (parent, args, context) => {
    const modelArgs = {
      ...args,
      userId: context.userId
    }

    return await Workout.createWorkout(modelArgs)
  },


  updateWorkout: async (parent, args, context) => {
    const modelArgs = {
      ...args,
      userId: context.userId
    }

    return await Workout.updateWorkout(modelArgs)
  },
  
  
  deleteWorkout: async (parent, args, context) => {
    const { userId } = context
    const workoutId = args.id

    return await Workout.deleteWorkout(userId, workoutId)
  },



  // Exercise Interactions ///////////////////////////////////////////////
  createExercise: async (parent, args, context) => {
    const modelArgs = {
      ...args,
      userId: context.userId
    }

    return await Exercise.createExercise(modelArgs)
  },

  
  deleteExercise: async (parent, args, context) => {
    const { userId } = context
    const exerciseId = args.id

    return await Exercise.deleteExercise(userId, exerciseId)
  },



  // Session Interactions ////////////////////////////////////////////////
  createSession: async (parent, args, context) => {
    const { userId } = context
    const { workoutId } = args

    return await Session.createSession(userId, workoutId)
  },
  

  completeSession: async (parent, args, context) => {
    const { userId } = context
    const sessionId = args.id

    return await Session.completeSession(userId, sessionId)
  },
  
  

  // Exercise Instance Interactions //////////////////////////////////////
  updateSetForExInstance: async (parent, args, context) => {
    const modelArgs = {
      userId: context.userId,
      exInstanceId: args.id,
      setsCompleted: args.setsCompleted
    }

    return await ExerciseInstance.updateSetForExInstance(modelArgs)
  },
}