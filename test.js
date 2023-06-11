function route() {
  // Some code that may throw an error
  console.log("throwing");
  throw new Error("This is an example error.");
}

function server() {
  try {
    route();
  } catch (err) {
    console.log(err);
    }
    console.log('ok')
}


server()