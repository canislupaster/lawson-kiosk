import { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,css}"],
  theme: {
    extend: {
      fontFamily: {
        "title": ["UnitedSans", "sans"],
        "body": ["AcuminPro", "sans"]
      },
      colors: {
        aged: {
          DEFAULT: '#8E6F3E', // rgb(142, 111, 62)
        },
        black: {
          DEFAULT: '#000000', // rgb(0, 0, 0)
        },
        steel: {
          DEFAULT: '#555960', // rgb(85, 89, 96)
        },
        coolGray: {
          DEFAULT: '#6F727B', // rgb(111, 114, 123)
        },
        boilermakerGold: {
          DEFAULT: '#CFB991', // rgb(207, 185, 145)
        },
        rush: {
          DEFAULT: '#DAAA00', // rgb(218, 170, 0)
        },
        field: {
          DEFAULT: '#DDB945', // rgb(221, 185, 69)
        },
        dust: {
          DEFAULT: '#EBD99F', // rgb(235, 217, 159)
        },
        railwayGray: {
          DEFAULT: '#9D9795', // rgb(157, 151, 149)
        },
        steam: {
          DEFAULT: '#C4BFC0', // rgb(196, 191, 192)
        },
      }
    },
  },
  plugins: [],
} satisfies Config;
