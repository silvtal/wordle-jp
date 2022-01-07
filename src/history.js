import {differenceInDays, addDays} from "date-fns";

const firstDay = new Date(2022, 0, 6, 4, 0, 0);

class History {
  constructor() {
  }

  lastGameInfo() {
    return {
      day: 7,
      solved: true,
    }
  }

  dayIndex() {
    return Math.floor(differenceInDays(new Date(), firstDay));
  }

  nextGameDate() {
    let now = new Date();
    if (now.getHours() < 4) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
    }
    else {
      let date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
      return addDays(date, 1);
    }
  }
}

export {History};
