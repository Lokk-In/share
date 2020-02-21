require("dotenv").config()

const crypto = require("crypto")
const express = require("express")
const fileUpload = require("express-fileupload")
const fs = require("fs")
const nanoid = require("nanoid")
const path = require("path")
const app = express()
const algorithm = "aes-256-ctr"
const key = crypto.createHash("sha256").update(process.env.KEY).digest("base64").substr(0, 32)

// Set file upload limits
app.use(fileUpload({
    limits: { fileSize: process.env.MAX_FILESIZE * 1024 * 1024, files: 1 },
}))

// Serve the public directory to page index
app.use(express.static("public"))

// receive uploaded files
app.post("/upload", async (req, res) => {
    
    // if no files were uploaded, respond with "Invalid Request"
    if (req.files == null || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: "No file uploaded" })
    }

    let file = req.files.file

    // check wether file was too big (user bypassed client validation)
    // if it was too big, respond with "Invalid Request"
    if (file.truncated) {
        return res.status(400).json({ error: "File too big" })
    }

    // encrypt uploaded file
    const encryptedBuffer = encryptFile(file.data)

    // generate unique file name based on original file name
    const uniqueFileName = nanoid(10)

    // write encrypted file to disk
    await writeFileToDisk(encryptedBuffer, uniqueFileName).catch(err => {
        console.log(err)
        return res.status(500).json({ error: "Internal server error" })
    })


    // respond with success and download url
    res.status(200).json({ url: uniqueFileName })
})

app.get("/:id", async (req, res) => {
    const id = req.params.id

    let finish = true
    // read encrypted file from disk
    const encrypted = await readFileFromDisk(id).catch(err => {
        console.log(err)
        res.status(400).send()
        finish = false
    })

    if (!finish) return
    // TODO Read file info from database
    const filename = "testfile.name"
    const mimetype = "image.png"

    // decrypt file
    const decrypted = decryptFile(encrypted)
    
    // set filename via content disposition header and send the file on its way
    // set mimetype
    res.status(200)
        .set({
            "Content-Disposition": `attatchment; filename="${filename}"`,
            mimetype
        })
        .end(decrypted)

    await deleteFileFromDisk(filename)
})

// encrypts a buffer using the aes256 algorithm
const encryptFile = buffer => {
    // initializer
    const init = crypto.randomBytes(16)

    const cipher = crypto.createCipheriv(algorithm, key, init)

    const result = Buffer.concat([init, cipher.update(buffer), cipher.final()])
    return result
}

const decryptFile = buffer => {
    // prep file
    const init = buffer.slice(0, 16)
    buffer = buffer.slice(16)

    const decipher = crypto.createDecipheriv(algorithm, key, init)

    const result = Buffer.concat([decipher.update(buffer), decipher.final()])
    return result
}

const writeFileToDisk = (buffer, name) => {
    return new Promise((resolve, reject) => {
        fs.writeFile(path.join(process.env.FILEPATH, name), buffer, err => {
            if (err != null) reject(err)
            resolve()
        })
    })
}

const readFileFromDisk = name => {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(process.env.FILEPATH, name), (err, data) => {
            if (err) reject(err)
            resolve(data)
        })
    })
}

const deleteFileFromDisk = name => {
    return new Promise((resolve) => {
        fs.unlink(path.join(process.env.FILEPATH, name), () => {
            resolve()
        })
    })
}

// create directory to upload files to if it doesn't exist
fs.mkdir(process.env.FILEPATH, err => {
    if (err != null) {
        console.error(`Did not create directory ${process.env.FILEPATH}. Directory already exists`)
    }
})

app.listen(3000, () => {
    console.log("Started webserver on port 3000")
})