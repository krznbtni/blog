module.exports = class Search {

  constructor(app) {
    app.get('/search/:searchWord', (req, res) => {
      this.search(res, req.params.searchWord);
    });
  }

  async searchPosts(searchWord) {
    let q = 'SELECT id, title, content FROM posts WHERE ';
    q += 'title LIKE ?';
    q += ' OR content LIKE ?';

    return await global.dbQuery(q, [searchWord, searchWord]);
  }

  async search(res, searchWord) {
    searchWord = '%' + searchWord + '%';

    let posts = await this.searchPosts(searchWord);

    res.json({ posts });
  }
}