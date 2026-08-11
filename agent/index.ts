
import PORT from "dotenv"
import * as http from "http"

const server =  http.createServer((res, req) => {



})


server.listen( PORT, () => {
    console.log("Hello love! ")
} )