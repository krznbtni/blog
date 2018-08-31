module.exports = class CookieSession {

  constructor(
    cookieName = 'blog-cookie',
    removeInactiveSessionsAfterMs = 60*60*1000 // 1 hour
  ) {
    this.sessionMem = {};
    this.cookieName = cookieName;
    this.removeInactiveSessionsAfterMs = removeInactiveSessionsAfterMs;

    setInterval(
      () => { this.removeInactiveSessions(); },
      removeInactiveSessionsAfterMs / 10 // Run every 6 minutes
    );
  }

  middleware()  {
    return (req, res, next) => {
      let cookieVal = this.getCookie(req) || this.setCookie(res);
      req.session = this.getSession(cookieVal);
      req.session.lastActivity = new Date();
      next();
    }
  }

  getCookie(req) {
    return req.cookies[this.cookieName];
  }

  setCookie(res) {
    // Set cookie on respond method
    let value = this.generateCookieValue();

    res.cookie(this.cookieName, value, {
      expires: 0,
      httpOnly: true,
      path: '/',
      secure: false // Not secure because it's HTTP
    });

    return value;
  }

  // Randomize cookie value
  generateCookieValue() {
    let newCookieValue;

    while (!newCookieValue || this.sessionMem[newCookieValue]) {
      newCookieValue = (Math.random() + '').split('.')[1];
    }

    return newCookieValue;
  }

  getSession(cookieVal) {
    // Create session if none exists
    if (!this.sessionMem[cookieVal]) {
      let session = {
        cookieVal: cookieVal,
        user: false
      }

      this.sessionMem[cookieVal] = session;
    }

    return this.sessionMem[cookieVal];
  }

  removeInactiveSessions() {
    for (let i in this.sessionMem) {
      if (
        this.sessionMem[i].lastActivity.getTime() + 
        this.removeInactiveSessionsAfterMs < new Date().getTime()
      ) {
        // Remove session if inactive for too long
        delete this.sessionMem[i];
      }
    }
  }





}