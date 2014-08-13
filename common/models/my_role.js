/*
  Module dependencies
*/
var util = require('util')
var debug = require('debug')('exampleApp:MyRole');

var assert = require('assert');
var async = require('async');
var i8n = require('inflection');

module.exports = function(Role){
  Role.once('modelSetupCompleted',function(){
    
    var app = Role.app;
    // get Application and User Model
    app.models().forEach(function(model){
      console.log(model.modelName);
    });
    var RoleMapping = app.models.RoleMapping;
    var Application = app.models.Application;
    var Customer = app.models.Customer;

    // we group Applications, Users and (child) Roles with roles, so they have (and belong to) many roles
    // NOTE: we use the core 'RoleMapping' model which has already the attributes 'principalType' and 'principalId' 
    // which we can refer to with the polymorphic attribute of the HABTM relation
    Application.hasAndBelongsToMany(Role, { as: 'roles', through: RoleMapping, polymorphic: 'principal'});
    Customer.hasAndBelongsToMany(Role, { as: 'roles', through: RoleMapping, polymorphic: 'principal'});
    Role.hasAndBelongsToMany(Role, { as: 'roles', through: RoleMapping, polymorphic: 'principal'});

    // the optional inverted relations
    // Role.hasMany(Application, { as: 'applications', through: RoleMapping, polymorphic: 'principal', invert:true});
    // Role.hasMany(User, { as: 'users', through: RoleMapping, polymorphic: 'principal', invert:true});
    
    // normally we don't need to define this since the HABTM relation already defines this on the target model
    // but since we have a self reflexive relation Role <-- hasAndBelongToMany --> Role
    // we need to define the relations to child roles extra.
    Role.hasMany(Role, { as: 'child_roles', through: RoleMapping, polymorphic: 'principal', invert: true, foreignKey: 'roleId'});
    
    // NOTE: uncomment this to see the new model's prototype containing e.g. Application.prototype.__get__roles etc.
    debug('ROLE.PROTOTYPE');
    debug(Role.prototype);
    debug('ROLEMAPPING.PROTOTYPE');
    debug(RoleMapping.prototype);
    debug('APPLICATION.PROTOTYPE');
    debug(Application.prototype);
    debug('USER.PROTOTYPE');
    debug(Customer.prototype);
  });
  
  /**
   *  Check if a given principal is in the role
   *  
   *  NOTE: we need to slightly change this method, look for lines with NOTE in the comments
   *  
   *  @param {String} role The role name
   *  @param {Object} context The context object
   *  @callback {Function} callback
   *  @param {Error} err
   *  @param {Boolean} isInRole
   */
  Role.isInRole = function (role, context, callback) {
    // NOTE: we have no access to the AccessContext class from within our app: You can't find it with loopback.[get|find]Model(), 
    // NOTE: and it could only be required by deeply accessing the node_modules directory since it's never exported any where else in a loopback app
    
    // NOTE: currently this works because 'isInRole' is called with a AccessContext. It would work when called with a plain context object
    
    
    // if (!(context instanceof AccessContext)) {
    //   context = new AccessContext(context);
    // }

    var RoleMapping = Role.app.models.RoleMapping;
    debug('isInRole(): %s', role);
    context.debug();

    var resolver = Role.resolvers[role];
    if (resolver) {
      debug('Custom resolver found for role %s', role);
      resolver(role, context, callback);
      return;
    }

    if (context.principals.length === 0) {
      debug('isInRole() returns: false');
      process.nextTick(function () {
        callback && callback(null, false);
      });
      return;
    }

    var inRole = context.principals.some(function (p) {

      var principalType = p.type || undefined;
      var principalId = p.id || undefined;

      // Check if it's the same role
      return principalType === RoleMapping.ROLE && principalId === role;
    });

    if (inRole) {
      debug('isInRole() returns: %j', inRole);
      process.nextTick(function () {
        callback && callback(null, true);
      });
      return;
    }

    this.findOne({where: {name: role}}, function (err, result) {
      if (err) {
        callback && callback(err);
        return;
      }
      if (!result) {
        callback && callback(null, false);
        return;
      }
      debug('Role found: %j', result);

      // Iterate through the list of principals
      async.some(context.principals, function (p, done) {
        var principalType = p.type || undefined;
        var principalId = p.id || undefined;
        var roleId = result.id.toString();
        
        // NOTE: here we need a translation from the Role constants USER, APP and ROLE to the model names (especially our extended user model 'Customer')
        // because polymorphic relations store the target model's name as principalType
        switch(principalType){
          case 'USER':
            principalType = 'Customer'
            break;
          case 'APP': case 'APPLICATION':
            principalType = 'Application'
            break;
          case 'ROLE':
            principalType = 'Role'
            break;
        }
        
        if(principalId !== null && principalId !== undefined && (typeof principalId !== 'string') ) {
          principalId = principalId.toString();
        }

        if (principalType && principalId) {
          // NOTE: we slightly change the query: 
          // In the original Role and RoleMapping, the RoleMapping has a 'belongsTo' relation back to the role, on which this relations was based.
          // Since we have a own 'MyRole' model and we use the 'RoleMapping' model differently (as a through model for a polymorphic relation)
          // we have change the original query key for 'Role' (=> roleId) to the one for 'MyRole' (=> myRoleId)
          
          // oldQuery: RoleMapping.findOne({ where: { roleId: roleId, principalType: principalType, principalId: principalId } },
          RoleMapping.findOne({ where: { myRoleId: roleId, principalType: principalType, principalId: principalId } },
            function (err, result) {
              debug('Role mapping found: %j', result);
              done(!err && result); // The only arg is the result
            });
        } else {
          process.nextTick(function () {
            done(false);
          });
        }
      }, function (inRole) {
        debug('isInRole() returns: %j', inRole);
        callback && callback(null, inRole);
      });
    });

  };

};