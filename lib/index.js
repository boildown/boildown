'use strict'
const path = require('path')
const fs = require('fs')

const _ = require('lodash')
const mkdirp = require('mkdirp')
const PathObject = require('path-object')()
const walk = require('walk')
const fixpack = require('fixpack')

module.exports.autoScaffold = (input, done) => {
  const answersRe = {
    checkbox: [],
    select: []
  }
  input.answers = _.mapValues(input.answers, (value, key) => {
    if (/^package/.test(key)) return value
    if (typeof value === 'string' || typeof value === 'number') {
      answersRe.select.push(new RegExp(`\\^§?${key}/@${value}/`))
      return {
        [value]: true
      }
    }
    if (Array.isArray(value)) {
      let ret = {}
      value
      .map(v => v.toLowerCase())
      .forEach(v => {
        answersRe.checkbox.push(new RegExp(`@${v}/`))
        ret[v] = true
      })
      return ret
    }
    return value
  })
  const fileObj = new PathObject()
  const walker = walk.walk(input.templateDir, {followLinks: false})
  walker.on('file', (wroot, fileStat, next) => {
    const fpath = path.join(path.relative(input.templateDir, wroot), fileStat.name)
    fs.readFile(path.join(input.templateDir, fpath), 'utf8', (err, data) => {
      if (err) return done(err)
      fileObj.set(fpath, _.template(data))
      next()
    })
  })

  walker.once('errors', (wroot, error) => {
    walker.removeAllListeners('end')
    done(error.pop())
  })

  function copyFile (origin) {
    let file = origin.replace(/[\^|@][^§].*?\//g, '').replace('^§', '')
    file = path.join(input.dest, file)
    mkdirp.sync(path.dirname(file))
    fs.writeFileSync(file, fileObj.get(origin)(input.answers), 'utf8')
  }

  walker.once('end', () => {
    const files = _.keys(fileObj.dump())

    while (files.length) {
      const file = files.shift()
      if (!~file.indexOf('@') && !~file.indexOf('^')) {
        copyFile(file)
        continue
      }
      const selected = answersRe.select.some(re => {
        if (re.test(file)) {
          const rest = file.split(re).pop()
          if (~rest.indexOf('@')) {
            return answersRe.checkbox.some(re2 => re2.test(rest))
          }
          return true
        }
      })
      if (selected) {
        copyFile(file)
        continue
      }
      const checked = answersRe.checkbox.some(re => {
        if (re.test(file)) {
          const rest = file.split(re).join('')
          if (~rest.indexOf('^')) {
            return answersRe.select.some(re2 => re2.test(rest))
          }
          return true
        }
      })
      if (checked) {
        copyFile(file)
        continue
      }
    }
    const githubUrl = `https://github.com/${input.answers.packageOrg}/${input.answers.packageName}`
    let pkg = {
      name: input.answers.packageName,
      description: input.answers.packageDescription,
      version: '1.0.0',
      author: input.answers.packageAuthor,
      homepage: githubUrl,
      license: 'MIT',
      repository: {
        type: 'git',
        url: `${githubUrl}.git`
      },
      bugs: {
        url: `${githubUrl}/issues`
      }
    }
    fs.writeFileSync(
      path.join(input.dest, 'package.json'),
      JSON.stringify(input.package(pkg, input.answers), null, 2) + '\n',
      'utf8'
    )
    fixpack(path.join(input.dest, 'package.json'), {quiet: true})
    done()
  })
}
