const fs = require("fs/promises")
class Document {
   #cols
   #values
   #primaryKey
   #onSave
   constructor(name, cols, values = null, onSave = null) {
       this.name = name
       this.#cols = {}
       this.#values = []
       if (values) this.#values = values
       if (onSave) this.#onSave = onSave
       this.#primaryKey = null
       ensureCols(cols)
       for ([k,v] of Object.entries(cols)) {
         if (v.primary) {
           this.#primaryKey = k
           v.required = true
         }
         this.#cols[k] = v
       }
   }
   _colsEqual(cols) {
       return JSON.stringify(cols) == JSON.stringify(this.#cols)
   }
   find(object) {
       if (!object || !object[this.#primaryKey]) return this.#values 
       return this.#values.filter(a=>a[this.#primaryKey] == object[this.#primaryKey])
   }
   findOne(object) {
       return this.find(object)[0]
   }
   findOneById(id) {
      return this.#values.find(a=>a[this.#primaryKey] == id)
   }
   async save(object) {
       let requiredKeys = Object.entries(this.#cols).filter(a=>a[1].required&&a[1].default==undefined).map(a=>a[0])
       if (Object.keys(object).filter(a=>requiredKeys[a]).length > 0) throw new Error(`Missing required keys: ${Object.keys(object).filter(a=>requiredKeys[a]).join(", ")}`)
       for ([k,v] of Object.entries(this.#cols)) {
           if (v.default != undefined && !object[k]) object[k] = v.default
           if (typeof object[k] != v.type) throw new Error(`Wrong type for key ${k}. Required: ${v.type}. Present: ${typeof object[k]}`)
       }
       let key = this.findOneById(object[this.#primaryKey])
       if (key) {
           for ([k,v] of Object.entries(key)) {
               if (object[k] != key[k]) key[k] = object[k]
           }
       } else {
           for ([k,v] of Object.entries(this.#cols)) {
               if (v.default != undefined && !object[k]) object[k] = v.default
           }
           this.#values.push(object)
       }
       if (this.#onSave) await this.#onSave()
       return object
   }
   toJSON() {
       return { name: this.name, cols: this.#cols, primaryKey: this.#primaryKey, values: this.#values }
   }
}
let types = [ "number", "string", "object", "boolean" ]
function ensureCols(cols) {
   for ([k,v] of Object.entries(cols)) {
       if (typeof v != "object") throw new Error(`Key with name ${k} doesn't have an object value`)
       if (!types.includes(v.type.toString().toLowerCase())) throw new Error(`Key with name ${k} has wrong value type`)
       if (v.primary && typeof v.primary != "boolean") throw new Error(`Key with name ${k} has wrong value type`)
       if (v.required && typeof v.required != "boolean") throw new Error(`Key with name ${k} has wrong required value type`)
       if (v.default && typeof v.default != v.type) throw new Error(`Key with name ${k} has wrong default value type`)
       if (v.primary && !v.required) v.required = true
   }
   if (!Object.values(cols).find(a=>a.primary)) throw new Error(`No primary column found`)
   if (Object.values(cols).filter(a=>a.primary).length > 1) throw new Error(`More than one primary column found`)
}
module.exports.ensureCols = ensureCols
module.exports.Database = class Database {
   #docs
   constructor(filename) {
       this.#docs = []
       for (let docFile of require("fs").readdirSync("./data").filter(a=>a.endsWith(".json"))) {
           try {
           let doc = require(`../data/${docFile}`)
           this.#docs.push(new Document(doc.name, doc.cols, doc.values, async () => { await this.save() }))
           } catch {
           fs.copyFile(`./data/backup/${docFile}`, `./data/${docFile}`).then(() => {
           let doc = require(`../data/${docFile}`)
           this.#docs.push(new Document(doc.name, doc.cols, doc.values, async () => { await this.save() }))
           })
           }
       }
   }
   async save() {
       for (let doc of this.#docs.map(a=>a.toJSON())) {
           await fs.copyFile(`./data/${doc.name}.json`, `./data/backup/${doc.name}.json`)
           await fs.writeFile(`./data/${doc.name}.json`, JSON.stringify(doc))
       }
   }
   addDocument(name, cols, values = null) {
       if (!name || typeof name != "string") throw new Error("Name must be present")
       ensureCols(cols)
       let doc = new Document(name, cols, values, async () => { await this.save() })
       if (!this.#docs.find(a=>a.name==name)) this.#docs.push(doc)
       else this.#docs[this.#docs.findIndex(a=>a.name==name)] = doc
       this.save()
       return doc
   }
   findDocument(name) {
       if (!name || typeof name != "string") throw new Error("Name must be present")
       return this.#docs.find(a=>a.name==name)
   }
}
