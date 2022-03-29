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