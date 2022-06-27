const express = require("express");
const app = express();
const fs = require("fs");
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const mysql = require('mysql');
const dbcon = mysql.createConnection({
  host: '127.0.0.1',
  user: 'app',
  password: 'applogin',
  database: 'mediastream'
});

dbcon.connect()
// dbcon.query("SELECT * FROM videoprogress;", (err,result,fields) => {
//     console.log(result[0].VideoProgress);
    // console.log(fields);
    // console.log(err);
// });

// connection.query('SELECT 1 + 1 AS solution', (err, rows, fields) => {
//   if (err) throw err

//   console.log('The solution is: ', rows[0].solution)
// })

// connection.end()

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.get("/videoPlayer.html", function (req, res) {
    res.sendFile(__dirname + "/videoPlayer.html");
});

app.get("/bojjiSprites.png", function (req, res) {
    res.sendFile(__dirname + "/bojjiSprites.png");
});

app.get("/testVidList", function (req, res) {
    res.send(`{"Series1":{"Title":"Really Cool Show 1","Episode Count":"3","Episodes":{"e1":{"title":"Episode 1","desc":"s1e1"},"e2":{"title":"Episode 2","desc":"s1e2"},"e3":{"title":"Episode 3","desc":"s1e3"}}},"Series2":{"Title":"Really Cool Show 2","Episode Count":"3","Episodes":{"e1":{"title":"Episode 1","desc":"s2e1"},"e2":{"title":"Episode 2","desc":"s2e2"},"e3":{"title":"Episode 3","desc":"s2e3"}}},"Series3":{"Title":"Really Cool Show 3","Episode Count":"3","Episodes":{"e1":{"title":"Episode 1","desc":"s3e1"},"e2":{"title":"Episode 2","desc":"s3e2"},"e3":{"title":"Episode 3","desc":"s3e3"}}},"Series4":{"Title":"Really Cool Show 4","Episode Count":"3","Episodes":{"e1":{"title":"Episode 1","desc":"s4e1"},"e2":{"title":"Episode 2","desc":"s4e2"},"e3":{"title":"Episode 3","desc":"s4e3"}}},"Series5":{"Title":"Really Cool Show 5","Episode Count":"3","Episodes":{"e1":{"title":"Episode 1","desc":"s5e1"},"e2":{"title":"Episode 2","desc":"s5e2"},"e3":{"title":"Episode 3","desc":"s5e3"}}}}`);
});

app.get("/testvid", function (req, res) {
    const range = req.headers.range;
    if (!range) {
        res.status(400).send("Requires Range header");
    }
    const videoPath = "testvid.mp4";
    const videoSize = fs.statSync("testvid.mp4").size;
    const CHUNK_SIZE = 10 ** 6;
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
    const contentLength = end - start + 1;
    const headers = {
        "Content-Range": `bytes ${start}-${end}/${videoSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": "video/mp4"
    };
    res.writeHead(206, headers);
    const videoStream = fs.createReadStream(videoPath, { start, end });
    videoStream.pipe(res);
});

app.put("/progressSubmit", function (req, res) {
    // console.log(req.body);
    dbcon.query(`UPDATE videoprogress SET VideoProgress = ${req.body.videoProgress} WHERE VideoTitle LIKE '${(req.body.videoTitle).substr(1)}%';`)
    res.sendStatus(200);
});

app.put("/progressGet", function (req, res) {
    // console.log(req.body.videoTitle);
    // console.log(`SELECT VideoProgress FROM videoprogress WHERE VideoTitle LIKE '_${req.body.videoTitle}%';`);
    dbcon.query(`SELECT VideoProgress FROM videoprogress WHERE VideoTitle LIKE '${(req.body.videoTitle).substr(1)}%';`, (err,result,fields) => {
        // console.log(result);
        res.send(`${result[0].VideoProgress}`);
        //res.sendStatus(200);
    });
});

const listeningPort = 7196;
app.listen(listeningPort, function () {
    console.log(`Listening on port ${listeningPort}...`);
});