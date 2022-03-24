const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const verifyAuth = require('./utils/verifyAuth')
const makeAuthedQuery = require('./utils/makeAuthedQuery')

const seed = require('./seed');

const { AuthenticationError } = require('apollo-server')



const resolvers = {
  Query: {
    info: () => 'This is the info',


    workouts: async (parent, args, context) => {
      return makeAuthedQuery(context.userId, () => {
        return context.prisma.workout.findMany({
          where: { userId: context.userId }
        })
      })
    },

    
    workout: (parent, args, context) => {
      return makeAuthedQuery(context.userId, () => {
        return context.prisma.workout.findFirst({
          where: {
            userId: context.userId,
            id: Number(args.id)
          }
        })
      })
    },


    session: (parent, args, context) => {
      return makeAuthedQuery(context.userId, () => {
        return context.prisma.session.findFirst({
          where: {
            userId: context.userId,
            id: Number(args.id)
          }
        })
      })
    },


    sessions: (parent, args, context) => {
      return makeAuthedQuery(context.userId, () => {
        return context.prisma.session.findMany({
          where: { userId: context.userId }
        })
      })
    }
  },


  Mutation: {
    seed: seed,


    signup: async (parent, args, context) => {
      console.log('called signup resolver')
      

      const hashedPassword = await bcrypt.hash(args.password, 10)

      const user = await context.prisma.user.create({
        data: { ...args, password: hashedPassword }
      })

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET)

      return { token, user }
    },


    login: async (parent, args, context) => {
      const user = await context.prisma.user.findUnique({ where: { username: args.username } })
      if (!user) return { error: 'Invalid credentials' }

      const passwordIsValid = await bcrypt.compare(args.password, user.password)
      if (!passwordIsValid) return { error: 'Invalid credentials' }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET)

      return { token, user }
    },


    createWorkout: (parent, args, context) => {
      return makeAuthedQuery(context.userId, async () => {
        const newWorkout = await context.prisma.workout.create({
          data: {
            name: args.name,
            description: args.description,
            length: args.length,
            location: args.location,
            userId: Number(context.userId)
          }
        });
  
        const formattedExercises = args.exercises?.map(ex => {
          ex.workoutId = Number(newWorkout.id);
          return ex;
        }) || [];
  
        await context.prisma.exercise.createMany({
          data: formattedExercises
        });
  
        return newWorkout;
      })
    },

    
    updateWorkout: async (parent, args, context) => {
      return makeAuthedQuery(context.userId, async () => {
        const originalWorkout = await context.prisma.workout.findFirst({
          where: {
            id: Number(args.id),
            userId: context.userId
          }
        })

        if (!originalWorkout) throw new AuthenticationError('You are not authenticated. Please log in.')

        const updatedWorkout = await context.prisma.workout.update({
          where: {
            id: Number(args.id)
          },
          data: {
            name: args.name,
            description: args.description,
            length: args.length,
            location: args.location
          }
        })
    
        const exercises = args.exercises || []
    
        
        for (let i = 0; i < exercises.length; i++) {
          const exercise = exercises[i]
    
          // upsert - updates exercise if one with id found
          // otherwise create exercise
          await context.prisma.exercise.upsert({
            where: { id: Number(exercise.id) || -1 },
            update: {
              name: exercise.name,
              reps: exercise.reps,
              sets: exercise.sets,
              weight: exercise.weight,
              unit: exercise.unit
            },
            create: {
              name: exercise.name,
              reps: exercise.reps,
              sets: exercise.sets,
              weight: exercise.weight,
              unit: exercise.unit,
              workoutId: Number(updatedWorkout.id)
            }
          })
        }
    
        const exsFromDb = await context.prisma.exercise.findMany({
          where: { workoutId: Number(updatedWorkout.id) }
        })
    
        // If an exercise in db is not found in exercise data from client
        // delete exercise
        for (let i = 0; i < exsFromDb.length; i++) {
          const exFromDbId = exsFromDb[i].id
    
          const exFound = exercises.map(ex => Number(ex.id)).includes(exFromDbId)
    
          if (!exFound) {
            await context.prisma.exercise.delete({
              where: { id: Number(exFromDbId) }
            })
          }
        }
    
        return updatedWorkout
      })

    },
    
    
    deleteWorkout: (parent, args, context) => {
      return makeAuthedQuery(context.userId, () => {
        return context.prisma.workout.deleteMany({
          where: {
            userId: context.userId,
            id: Number(args.id)
          }
        })
      })
    },


    addExerciseToWorkout: (parent, args, context) => {
      return makeAuthedQuery(context.userId, async () => {
        // Ensure user can only add exercises to their own workouts
        const assocWorkout = await context.prisma.workout.findFirst({
          where: {
            userId: context.userId,
            id: Number(args.workoutId)
          }
        })

        if (!assocWorkout) throw new AuthenticationError('You are not authenticated. Please log in.')
        
        const newExercise = await context.prisma.exercise.create({
          data: {
            name: args.name,
            reps: args.reps,
            sets: args.sets,
            weight: args.weight,
            unit: args.unit,
            workoutId: Number(args.workoutId)
          }
        })
        
        return newExercise
      })
    },

    
    deleteExercise: (parent, args, context) => {
      return makeAuthedQuery(context.userId, async () => {
        // Ensure user can only delete their own exercises
        const exercise = await context.prisma.exercise.findUnique({
          where: { id: Number(args.id) }
        })
        
        const assocWorkout = await context.prisma.workout.findFirst({
          where: {
            id: exercise.workoutId,
            userId: context.userId
          }
        })

        if (!assocWorkout) throw new AuthenticationError('You are not authenticated. Please log in.')

        return context.prisma.exercise.deleteMany({
          where: { id: Number(args.id) }
        })
      })
    },


    createSession: async (parent, args, context) => {
      return makeAuthedQuery(context.userId, async () => {
        const newSession = await context.prisma.session.create({
          data: {
            userId: context.userId,
            workoutId: Number(args.workoutId),
            completed: false
          }
        })

        // Get Exercises included in associated workout
        const exercises = await context.prisma.exercise.findMany({
          where: { workoutId: Number(args.workoutId) }
        })

        // Cretae ExerciseInstance for each exercise
        const exerciseInstances = exercises.map((ex) => {
          return {
            exerciseId: ex.id,
            sessionId: newSession.id,
            setsCompleted: 0,
            repsCompleted: 0
          }
        })

        await context.prisma.exerciseInstance.createMany({
          data: exerciseInstances
        })

        return newSession
      })
    },


    completeSession: (parent, args, context) => {
      return makeAuthedQuery(context.userId, () => {
        return context.prisma.session.updateMany({
          where: {
            userId: context.userId,
            id: Number(args.id)
          },
          data: { completed: true }
        })
      })

    },


    updateSetForExInstance: (parent, args, context) => {
      return makeAuthedQuery(context.userId, async () => {
        // Ensure user can only delete their own exercises
        const exInstance = await context.prisma.exerciseInstance.findUnique({
          where: { id: Number(args.id) }
        })
        
        const assocWorkout = await context.prisma.workout.findFirst({
          where: {
            id: exInstance.workoutId,
            userId: context.userId
          }
        })

        if (!assocWorkout) throw new AuthenticationError('You are not authenticated. Please log in.')

        return context.prisma.exerciseInstance.update({
          where: { id: Number(args.id) },
          data: { setsCompleted: args.setsCompleted }
        })
      })
    },
  },


  Workout: {
    exercises: (parent, args, context) => {
      return context.prisma.workout.findUnique({ where: { id: parent.id } }).exercises();
    },

    sessions: (parent, args, context) => {
      return context.prisma.workout.findUnique({ where: { id: parent.id }}).sessions()
    },

    user: (parent, args, context) => {
      return context.prisma.workout.findUnique({ where: { id: parent.id } }).user()
    }
  },


  Exercise: {
    workout: (parent, args, context) => {
      return context.prisma.exercise.findUnique({ where: { id: parent.id } }).workout();
    },
    
    exerciseInstances: (parent, args, context) => {
      return context.prisma.exercise.findUnique({ where: { id: parent.id } }).exerciseInstances();
    }
  },


  Session: {
    workout: (parent, args, context) => {
      return context.prisma.session.findUnique({ where: { id: parent.id } }).workout()
    },

    exerciseInstances: (parent, args, context) => {
      return context.prisma.session.findUnique({ where: { id: parent.id } }).exerciseInstances()
    },

    user: (parent, args, context) => {
      return context.prisma.session.findUnique({ where: { id: parent.id } }).user()
    },

    date: (parent, args, context) => {
      return parent.createdAt
    }
  },


  ExerciseInstance: {
    exercise: (parent, args, context) => {
      return context.prisma.exerciseInstance.findUnique({ where: { id: parent.id }}).exercise()
    },

    session: (parent, args, context) => {
      return context.prisma.exerciseInstance.findUnique({ where: { id: parent.id } }).session()
    }
  }
}

module.exports = resolvers;
