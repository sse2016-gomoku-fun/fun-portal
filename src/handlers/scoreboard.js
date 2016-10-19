import * as web from 'express-decorators';
import utils from 'libs/utils';
import asyncGetLeaderboard from 'libs/leaderboard';

@web.controller('/')
export default class Handler {

  @web.use()
  async navType(req, res, next) {
    res.locals.nav_type = 'scoreboard';
    next();
  }

  @web.get('/')
  @web.middleware(utils.checkProfile())
  async getScoreboardAction(req, res) {
    const results = await asyncGetLeaderboard(true);
    // DEBUG
    console.log('results :');
    console.log(results);
    res.render('home', {
      page_title: 'Scoreboard',
    });
  }
}
