var map, layer;

var state = {category: "Privacy International 2007/Totalt"};

function padDigits(number, digits) {
  return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
}

function getByCategory(data, category) {
  category.split("/").map(function (name) { if (data[name] == undefined) data[name] = {}; data = data[name]; });
  return data;
}

function dataGetCategories(data) {
  return Object.keys(data).filter(function (x) { return x != 'Source' && x != 'value'; });
}

function dataToTableWidth(data) {
  var res = 1;
  dataGetCategories(data).map(function (key) {
    var sub = data[key];
    var sublength = 1;
    if (typeof(sub) == "object") {
      var subcategories = dataGetCategories(sub);
      if (subcategories.length > 0) {
        sublength = dataToTableWidth(sub);
      }
    }
    res = Math.max(res, 1 + sublength);
  });
  return res;
}

function commonPrefix(path1, path2) {
  var i;
  for (i = 0; i < Math.min(path1.length, path2.length); i++) {
    if (path1[i] != path2[i]) return i;
  }
  return i;
}

function strMul(str, nr) {
  res = '';
  for (var i = 0; i < nr; i++) {
    res += str;
  }
  return res;
}

function dataToTable(data) {
  var width = dataToTableWidth(data);
  var res = "<table>";
  var lastpath = [];


  function updatePath(path, value) {
    var common = commonPrefix(lastpath, path);
    lastpath = path;
    path = path.slice(common);

    for (var i = 0; i < path.length; i ++) {
      var colspan = width - common - i - 1;
      res += '<tr>';
      res += strMul('<td class="iteminfo-bump">&nbsp;</td>', common + i);
      res += '<td colspan="' + colspan + '">' + path[i] + '</td>';
      var v = value;
      if (i < path.length - 1) {
        v = '';
      }
      if (typeof(v) == "number") {
        v = Math.round(v * 100) / 100;
      }
      res += '<td class="value">' + v + '</td>';
      res += '</tr>';
    }
  }

  function dataToTable(path, data) {
    dataGetCategories(data).map(function (key) {
      var sub = data[key];
      var subpath = path.concat([key]);
      if (sub.value != undefined && sub.value != '') {
        updatePath(subpath, sub.value);
      }
      dataToTable(subpath, sub);
    });
  }
  dataToTable([], data);
  res += "</table>";
  return res;
}

$(document).ready(function () {
  var mapTabClicked;

  async.series([
    function(cb){
      $.get("data/world.geojson", function (geojson) { data.worldmap = geojson; cb (); }, "json");
    },

    function(cb){
      $.get("data/maplinks.json", function (json) { data.maplinks = json; cb (); }, "json");
    },

    function(cb){
      $.get("data/country-rankings.csv", function (regiondata) {
        data.regiondata = {};
        data.categories = {};
        $.csv.toObjects(regiondata).map(function (info) {
          var category = info.Category;
          delete info.category;
          for (var region in info) {
            value = parseFloat(info[region]);
            if (value.toString() == "NaN") value = info[region];
            getByCategory(data.categories, category);
            if (data.regiondata[region] == undefined) data.regiondata[region] = {};
            getByCategory(data.regiondata[region], category).value = value;
          }
        });
        cb();
      });
    },

    function (cb) {
      mapTabClicked = cb;
    },

    function (cb) {
      map = new OpenLayers.Map({
        div: "map",
        allOverlays: true,
        maxExtent: new OpenLayers.Bounds(
          -180, -90, 180, 90
        )
      });

      map.addControl(new OpenLayers.Control.Navigation());
      // map.addControl(new OpenLayers.Control.LayerSwitcher());
    
      var style = new OpenLayers.Style({
        fillColor : "${getBlockColor}",
      },{context: {
        getBlockColor: function (feature) {
          var score;
          try {
            score = getByCategory(data.regiondata[feature.data.ISO_2_CODE], state.category).value;
            if (typeof(score) != "number") throw "not a number";
          } catch(e) {
            return "#999999";
          }
          var red = padDigits(Math.round(255 / 5 * (5 - score)).toString(16), 2)
          var green = padDigits(Math.round(255 / 5 * score).toString(16), 2)
          var blue = "00";
          return "#" + red + green + blue;
        }
      }});

      var geojson_format = new OpenLayers.Format.GeoJSON();
      var vector_layer = new OpenLayers.Layer.Vector("Vector Layer", {
        styleMap: new OpenLayers.StyleMap({'default': style}),
        eventListeners:{
          'featureselected':function(evt){
            var feature = evt.feature;
            $(".iteminfo").html("<b>" + feature.data.NAME + "</b>" + dataToTable(data.regiondata[feature.data.ISO_2_CODE]));
          },
          'featureunselected':function(evt){
          }
        }
      });
      vector_layer.addFeatures(geojson_format.read(data.worldmap));
      map.addLayer(vector_layer);

      map.addControl(new OpenLayers.Control.SelectFeature(vector_layer, {
        autoActivate:true
      }));

      map.setCenter(
          new OpenLayers.LonLat(0, 0).transform(
              new OpenLayers.Projection("EPSG:4326"),
              map.getProjectionObject()
          ), 2
      );

      function addGroup(groups, slug, title, extra) {
        var group = $(".template .mapcontrol-category").clone();
        groups.append(group);
        group.find(".panel-title a").html(title);
        group.find(".panel-title a").attr({href: "#" + slug});
        if (extra) group.find(".panel-title").append(extra);
        group.find(".panel-collapse").attr({id: slug});
        return group.find(".panel-collapse .panel-body");
      }

      function addCategories(categories, parent, path) {
        path = path || [];
        parent = parent || $("#mapcontrols");

        var groupslug = $.slugify(path.join("-"));
        var groups = $("<div class='panel-group' id='" + groupslug + "'>");
        parent.append(groups);

        for (var category in categories) {
          if (category == "Source") continue;
          var categorypath = path.concat([category]);
          var categoryslug = $.slugify(categorypath);
          var subcategories = Object.keys(categories[category]);
          if (subcategories.length == 0 || (subcategories.length == 1 && subcategories[0] == 'Source')) {
            var choice = $("<div><input type='radio' name='category' id='" + categoryslug + "' value='" + categorypath.join("/") + "'><label for='" + categoryslug + "'>" + category + "</label> </div>");
            var src = getByCategory(data.regiondata.All, categorypath.concat(["Source"]).join("/")).value;
            if (src) {
              link = $("<a><i class='fa fa-external-link'></i></a>");
              link.attr({href: src});
              choice.append(link);
            }
            choice.find("input").change(function () {
              if (!$(this).is(':checked')) return;
              state.category = $(this).val();
              vector_layer.redraw();
            });
            parent.append(choice);

          } else {
            var link = undefined;
            var src = getByCategory(data.regiondata.All, categorypath.concat(["Source"]).join("/")).value;
            if (src) {
              link = $("<a class='pull-right'><i class='fa fa-external-link'></i></a>");
              link.attr({href: src});
            }
            addCategories(categories[category], addGroup(groups, categoryslug, category, link), categorypath);
          }
        }
      }

      addCategories(data.categories);

      data.maplinks.map(function (item) {
        var html = $("<div><a></a></div>");
        var lnk = html.find("a");
        lnk.html(item.title);
        lnk.attr({href: item.source});
        $("#mapcontrols").append(html);
      });

      $("#mapcontrols").append("<div class='iteminfo'></div>");

      cb();

    }
  ],
  function(err, results){

  });
    $('#map-tab a').on('shown.bs.tab', function (e) { if (mapTabClicked) mapTabClicked(); mapTabClicked = false; });
});
